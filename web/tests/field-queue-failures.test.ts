import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
test('failed photo retains dependent report but allows other photos and operations; malformed acknowledgements never discard photos',async()=>{
 const records=new Map<string,any>([['owner','tech'],['tech:queue',[
  {id:'photo1',type:'photo',operationId:'a',stageId:'s',fieldId:'f',name:'1.jpg',file:new Blob(['one'])},
  {id:'photo2',type:'photo',operationId:'a',stageId:'s',fieldId:'f',name:'2.jpg',file:new Blob(['two'])},
  {id:'report',type:'action',operationId:'a',body:{action:'report_save',photos:['local-photo1','local-photo2']}},
  {id:'same-op-independent',type:'action',operationId:'a',body:{action:'materials'}},
  {id:'independent',type:'action',operationId:'b',body:{action:'info_read'}}
 ]]]);
 let failure='http';const sent:string[]=[];let report:any;
 const context=createContext({Response,Request,FormData,Blob,URL,AbortSignal,importScripts(){},
  self:{navigator:{onLine:true},addEventListener(){},clients:{matchAll:async()=>[]},registration:{},nativeStorage:{read:async(key:string)=>structuredClone(records.get(key)),write:async(entries:any[])=>{for(const [key,value]of entries)records.set(key,structuredClone(value));}}},
  fetch:async(url:string,options:any)=>{
   if(!options.method)return Response.json({email:'tech',rows:[]});
   if(options.body instanceof FormData){const id=String(options.body.get('requestId'));sent.push(id);if(id==='photo1'&&failure==='http')return Response.json({error:'Falha da foto'}, {status:503});if(id==='photo1'&&failure==='malformed')return Response.json({});return Response.json({id:id==='photo1'?'1':'2'});}
   const body=JSON.parse(options.body);sent.push(body.action);if(body.action==='report_save')report=body;return Response.json({saved:true});
  }});
 runInContext(readFileSync(new URL('../public/field-offline/sw.js',import.meta.url),'utf8'),context);
 await runInContext('sync()',context);
 assert.deepEqual(sent,['photo1','photo2','materials','info_read']);
 assert.deepEqual(records.get('tech:queue').map((i:any)=>i.id),['photo1','report']);
 failure='malformed';await runInContext('sync()',context);
 assert.equal(records.get('tech:queue').length,2);
 failure='';await runInContext('sync()',context);
 assert.equal(records.get('tech:queue').length,0);
 assert.deepEqual(report.photos,['1','2']);
 assert.equal(sent.filter(i=>i==='photo2').length,1);
 assert.equal(sent.filter(i=>i==='info_read').length,1);
});
