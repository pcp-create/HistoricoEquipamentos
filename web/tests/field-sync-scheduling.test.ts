import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
const source=readFileSync(new URL('../public/field-offline/sw.js',import.meta.url),'utf8');
const item=(id:string)=>({id,type:'action',operationId:'a',body:{action:'info_read',requestId:id}});
function harness(queue:any[],fetcher:(url:string,options:any)=>Promise<Response>){
 const records=new Map<string,any>([['owner','tech'],['tech:queue',queue]]);
 const timers:{fn:()=>void,delay:number}[]=[];
 const context=createContext({Response,Request,FormData,Blob,URL,AbortSignal,importScripts(){},setTimeout(fn:()=>void,delay:number){timers.push({fn,delay});return timers.length;},clearTimeout(){},
 self:{navigator:{onLine:true},addEventListener(){},clients:{matchAll:async()=>[]},registration:{},nativeStorage:{read:async(k:string)=>structuredClone(records.get(k)),readMetadata:async(k:string)=>structuredClone(records.get(k)),write:async(entries:any[])=>{for(const[k,v]of entries)records.set(k,structuredClone(v));}}},fetch:fetcher});
 runInContext(source,context);return {records,timers,context,sync:()=>runInContext('sync()',context)};
}
test('idle sync checks identity without downloading every operation',async()=>{
 const urls:string[]=[];const h=harness([],async(url)=>{urls.push(url);return Response.json({email:'tech',rows:[{id:'a',version:1},{id:'b',version:1}]});});
 for(const id of ['a','b'])h.records.set('tech:cache:/api/field?operation='+id,{operation:{id,version:1}});
 await h.sync();assert.deepEqual(urls,['/api/field','/api/field/time-requests']);assert.equal(h.timers.length,0);
});
test('temporary server failures retry after two seconds and keep the same receipt until confirmation',async()=>{
 let failed=true;const receipts:string[]=[];
 const h=harness([item('receipt')],async(url,options)=>{if(!options.method)return Response.json({email:'tech',rows:[]});receipts.push(JSON.parse(options.body).requestId);return failed?Response.json({error:'Unavailable'},{status:503}):Response.json({saved:true});});
 await h.sync();assert.equal(h.records.get('tech:queue').length,1);assert.equal(h.records.get('connected'),true,'successful schedule refresh confirms connectivity while the failed send remains queued');assert.equal(h.timers[0].delay,2000);
 failed=false;h.timers[0].fn();await runInContext('flushing',h.context);
 assert.equal(h.records.get('tech:queue').length,0);assert.deepEqual(receipts,['receipt','receipt']);
});
test('a validation conflict stays visible without an automatic retry loop',async()=>{
 const h=harness([item('conflict')],async(url,options)=>!options.method?Response.json({email:'tech',rows:[]}):Response.json({error:'Confira os dados'},{status:409}));
 await h.sync();assert.equal(h.records.get('tech:queue')[0].error,'Confira os dados');assert.equal(h.timers.length,0);
});
test('new work preempts the remaining operation downloads',async()=>{
 const order:string[]=[];let injected=false;
 const h=harness([item('first')],async(url,options)=>{
 if(options.method){order.push(JSON.parse(options.body).requestId);return Response.json({saved:true});}
 if(url==='/api/field?operation=a'&&!injected){injected=true;h.records.set('tech:queue',[item('second')]);order.push('download-a');}
 if(url==='/api/field?operation=b')order.push('download-b');
 return Response.json({email:'tech',rows:[{id:'a'},{id:'b'}]});});
 await h.sync();assert.ok(order.indexOf('second')<order.indexOf('download-b'));assert.deepEqual(order.slice(0,3),['first','download-a','second']);assert.equal(h.records.get('tech:queue').length,0);
});

test('a temporary failure verifying the server also schedules a retry',async()=>{
 const h=harness([item('pending')],async()=>Response.json({error:'Unavailable'},{status:503}));
 await assert.rejects(h.sync(),/acessar o sistema/);
 assert.equal(h.timers[0].delay,2000);assert.equal(h.records.get('tech:queue').length,1);
});
test('status reads photo metadata without decoding queue blobs',async()=>{
 const h=harness([{...item('photo'),type:'photo',file:{__rjBlob:'large-photo'}}],async()=>Response.json({}));
 let decoded=false;
 runInContext('self.nativeStorage.readMetadata = async key => key === "tech:queue" ? [{id:"photo",type:"photo",operationId:"a"}] : null',h.context);
 const storage=runInContext('self.nativeStorage',h.context),original=storage.read;
 storage.read=async(key:string)=>{if(key==='tech:queue')decoded=true;return original(key);};
 const status=await runInContext('status()',h.context);
 assert.equal(status.pending,1);assert.equal(decoded,false);
});
