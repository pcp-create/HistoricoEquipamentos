import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

// Opt-in replay of a private backup against a local transport/session simulator.
// No network, database connection or real client data is included in the repository.
test('exported backup replays every record with unlinked meters retained only in reports', {skip:!process.env.FIELD_SYNC_BACKUP},async()=>{
 const backup=JSON.parse(readFileSync(process.env.FIELD_SYNC_BACKUP!,'utf8'));
 assert.equal(backup.format,'rj-field-offline-v1');
 const source=JSON.stringify(backup),queue=structuredClone(backup.queue);
 for(const item of queue)if(item.type==='photo')item.file=new Blob([Buffer.from(item.file.base64,'base64')],{type:item.file.type});
 const records=new Map<string,any>([['owner',backup.owner],[backup.owner+':queue',queue],[backup.owner+':mapping',backup.mapping]]);
 const pendingIds=new Set(queue.map((item:any)=>item.id)),acknowledged=new Set(queue.flatMap((item:any)=>{const previous=item.body?.offline?.previousRequestId;return previous&&!pendingIds.has(previous)?[previous]:[];}));
 const firstStop=queue.find((item:any)=>item.body?.action==='stop');
 let active=firstStop?{id:firstStop.body.sessionId,operationId:firstStop.operationId}:null,photoId=10000;
 const sent:string[]=[],errors:string[]=[],events:string[]=[];
 const context=createContext({Response,Request,FormData,Blob,URL,AbortSignal,importScripts(){},setTimeout:()=>1,clearTimeout(){},
  self:{navigator:{onLine:true},addEventListener(){},clients:{matchAll:async()=>[]},registration:{},nativeStorage:{read:async(key:string)=>structuredClone(records.get(key)),write:async(entries:any[])=>{for(const[key,value]of entries)records.set(key,structuredClone(value));}}},
  fetch:async(_url:string,options:any={})=>{
   if(!options.method)return Response.json({email:backup.owner,rows:[]});
   if(options.body instanceof FormData){
    const operationId=options.body.get('operationId');assert.equal(active?.operationId,operationId,'photo must wait for its work session');
    assert.ok((options.body.get('file') as Blob).size>0);events.push('photo');return Response.json({id:String(++photoId)});
   }
   const body=JSON.parse(options.body);sent.push(body.requestId);events.push(body.action);
   if(body.offline?.previousRequestId)assert.ok(acknowledged.has(body.offline.previousRequestId),'predecessor must be acknowledged');
   if(['start_work','start_travel'].includes(body.action)){assert.equal(active,null,'previous OS timer must end first');active={id:body.requestId,operationId:body.operationId};}
   if(body.action==='stop'){assert.equal(active?.operationId,body.operationId);assert.equal(active?.id,body.sessionId);active=null;}
   if(body.action==='report_save')assert.equal(active?.operationId,body.operationId,'report draft must have its activity');
   assert.equal(JSON.stringify(body).includes('local-'),false,'local photos must map to server IDs');
   acknowledged.add(body.requestId);return Response.json({saved:true});
  }});
 runInContext(readFileSync(new URL('../public/field-offline/sw.js',import.meta.url),'utf8'),context);
 await runInContext('sync()',context);
 const remaining=records.get(backup.owner+':queue');
 assert.equal(remaining.length,0);

 assert.equal(errors.length,0);assert.equal(new Set(sent).size,sent.length);
 assert.equal(events.filter(action=>action==='photo').length,queue.filter((item:any)=>item.type==='photo').length);

 assert.equal(JSON.stringify(backup),source,'input backup must remain unchanged');
 console.log(`Local replay: ${queue.length-remaining.length}/${queue.length} acknowledged; ${remaining.length} retained. No real requests made.`);
});
