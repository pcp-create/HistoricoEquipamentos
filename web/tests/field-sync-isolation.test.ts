import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createContext,runInContext} from 'node:vm';
function fixture(){
 const original={id:'failed',type:'action',operationId:'a',at:'2026-11-09T10:00:00Z',body:{action:'report_save',offline:{baseVersion:1}}};
 const records=new Map<string,any>([['owner','tech'],['tech:unrefreshed',true],['tech:queue',[original,{id:'dependent',type:'action',operationId:'a',body:{action:'report_save',offline:{baseVersion:2,previousRequestId:'failed'}}},{id:'other',type:'action',operationId:'b',body:{action:'info_read'}}]],['tech:cache:/api/field',{email:'tech',rows:[{id:'a',version:2,description:'Rascunho local'}],active:{operation_id:'a',kind:'work'}}],['tech:cache:/api/field?operation=a',{operation:{id:'a',version:2,document:{answers:'Texto não sincronizado'}}}]]);
 const sent:string[]=[],downloads:string[]=[],handlers:Record<string,any>={};
 const home={email:'tech',rows:[{id:'a',version:99,description:'Planejamento alterado'},{id:'b',version:1,description:'Nova OS'}],calendarRows:[{id:'a',version:99},{id:'b',version:1}],active:null};
 const context=createContext({setTimeout:()=>1,clearTimeout(){},Response,Request,FormData,Blob,URL,AbortSignal,importScripts(){},
 self:{navigator:{onLine:true},addEventListener:(name:string,handler:any)=>{handlers[name]=handler;},clients:{matchAll:async()=>[]},registration:{},nativeStorage:{read:async(key:string)=>structuredClone(records.get(key)),write:async(entries:any[])=>{for(const [key,value]of entries)records.set(key,structuredClone(value));}}},
 fetch:async(url:string,options:any={})=>{if(options.method){const body=JSON.parse(options.body);sent.push(body.action);return body.action==='report_save'?Response.json({error:'Conflito de versão'},{status:400}):Response.json({saved:true});}if(url.includes('?operation=')){downloads.push(url);return Response.json({operation:{id:url.split('=').at(-1),version:1,document:{}}});}return Response.json(home);}});
 runInContext(readFileSync(new URL('../public/field-offline/sw.js',import.meta.url),'utf8'),context);
 const message=async(data:any)=>{let result:any,pending:any;handlers.message({data,ports:[{postMessage:(value:any)=>{result=value;}}],waitUntil:(p:any)=>{pending=p;}});await pending;return result;};
 return {context,records,sent,downloads,message};
}
test('failed report does not prevent independent sends or downloading newly dispatched operations',async()=>{
 const {context,records,sent,downloads,message}=fixture();await runInContext('sync()',context);
 assert.deepEqual(sent,['report_save','info_read']);
 assert.deepEqual(records.get('tech:queue').map((v:any)=>v.id),['failed','dependent']);
 const cached=records.get('tech:cache:/api/field');assert.equal(cached.rows.find((r:any)=>r.id==='b').description,'Nova OS');assert.equal(cached.rows.find((r:any)=>r.id==='a').description,'Rascunho local');assert.equal(cached.active.operation_id,'a');
 assert.equal(records.get('tech:cache:/api/field?operation=a').operation.document.answers,'Texto não sincronizado');assert.ok(downloads.includes('/api/field?operation=b'));assert.ok(!downloads.includes('/api/field?operation=a'));
 assert.ok((await message({type:'FIELD_PREPARE'})).ok);
 const status=await message({type:'FIELD_STATUS'});assert.match(status.queue.find((q:any)=>q.id==='dependent').blockedReason,/Depende/);assert.equal(status.queue.find((q:any)=>q.id==='failed').dependents,1);
 await runInContext('sync()',context);assert.equal(sent.filter(v=>v==='report_save').length,1,'permanent failures are retained and skipped');
});
test('discarding only the failure preserves and blocks dependents; export includes a recoverable copy',async()=>{
 const {context,records,message}=fixture();await runInContext('sync()',context);
 assert.equal((await message({type:'FIELD_DISCARD',id:'failed'})).ok,true);
 assert.deepEqual(records.get('tech:queue').map((v:any)=>v.id),['dependent']);assert.equal(records.get('tech:queue')[0].discardedDependency,true);
 const backup=await message({type:'FIELD_EXPORT'});assert.equal(backup.backup.discarded[0].id,'failed');assert.equal(backup.backup.queue[0].id,'dependent');
 assert.equal((await message({type:'FIELD_DISCARD',id:'dependent'})).ok,true);assert.equal(records.get('tech:queue').length,0);
});
test('explicitly discarding a failed branch removes only that branch and leaves other work untouched',async()=>{
 const {context,records,message}=fixture();await runInContext('sync()',context);
 records.get('tech:queue').push({id:'unrelated',type:'action',operationId:'c',body:{action:'info_read'}});
 assert.equal((await message({type:'FIELD_DISCARD',id:'failed',includeDependents:true})).ok,true);
 assert.deepEqual(records.get('tech:queue').map((v:any)=>v.id),['unrelated']);assert.equal(records.get('tech:discardedQueue').length,2);
 assert.equal((await message({type:'FIELD_DISCARD',id:'unrelated'})).ok,false);
});

test('work captured during an operation download wins over the older server snapshot',async()=>{
 const {context,records}=fixture(),fetchOriginal=context.fetch as any;
 context.fetch=async(url:string,options:any)=>{
  const result=await fetchOriginal(url,options);
  if(url==='/api/field?operation=b'){
   records.get('tech:queue').push({id:'fresh-edit',type:'action',operationId:'b',body:{action:'report_save'}});
   records.set('tech:cache:/api/field?operation=b',{operation:{id:'b',version:2,document:{answers:'Resposta digitada durante o download'}}});
   records.get('tech:cache:/api/field').rows.push({id:'b',version:2,description:'Nova edição local'});
  }
  return result;
 };
 await runInContext('sync()',context);
 assert.equal(records.get('tech:cache:/api/field?operation=b').operation.document.answers,'Resposta digitada durante o download');
 assert.equal(records.get('tech:cache:/api/field').rows.find((row:any)=>row.id==='b').description,'Nova edição local');
 assert.ok(records.get('tech:queue').some((item:any)=>item.id==='fresh-edit'));
});

test('explicit retry releases dependents only after acknowledgement and preserves request data',async()=>{
 const {context,records,message,sent}=fixture();await runInContext('sync()',context);
 const before=structuredClone(records.get('tech:queue')[0]),originalFetch=context.fetch as any,resent:any[]=[];
 assert.equal((await message({type:'FIELD_RETRY',id:'dependent'})).ok,false);
 assert.equal((await message({type:'FIELD_STATUS'})).queue.find((q:any)=>q.id==='failed').canRetry,true);
 context.fetch=async(url:string,options:any={})=>{
  if(options.method){const body=JSON.parse(options.body);resent.push(body);sent.push(body.action);return Response.json({saved:true});}
  return originalFetch(url,options);
 };
 assert.equal((await message({type:'FIELD_RETRY',id:'failed'})).ok,true);
 assert.deepEqual(records.get('tech:queue'),[]);
 assert.deepEqual(resent[0],before.body);
 assert.deepEqual(sent,['report_save','info_read','report_save','report_save']);
});
test('retry that still fails preserves dependent data and version checks',async()=>{
 const {context,records,message,sent}=fixture();await runInContext('sync()',context);
 const before=structuredClone(records.get('tech:queue')[0].body);
 assert.equal((await message({type:'FIELD_RETRY',id:'failed'})).ok,true);
 assert.equal(sent.filter(v=>v==='report_save').length,2);
 assert.deepEqual(records.get('tech:queue')[0].body,before);
 assert.equal(records.get('tech:queue')[0].failedPermanent,true);
 assert.equal(records.get('tech:queue').length,2);
});
