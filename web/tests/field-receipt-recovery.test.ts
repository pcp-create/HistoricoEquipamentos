import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createContext,runInContext} from 'node:vm';
for(const mode of ["all","root","none","wrong-operation"])test(`discarded dependencies reconcile only with server receipts (${mode})`,async()=>{
 const original={id:'root',type:'action',operationId:'op',at:'2026-11-10T11:00:00Z',body:{action:'materials'}};
 const pending={id:'next',type:'action',operationId:'op',at:'2026-11-10T11:01:00Z',body:{action:'start_work',offline:{previousRequestId:'root'}},discardedDependency:true,error:'Anterior excluído'};
 const records=new Map<string,any>([['owner','tech'],['tech:queue',[pending]],['tech:discardedQueue',[original]]]);let posted=0;
 const context=createContext({setTimeout:()=>1,clearTimeout(){},Response,Request,FormData,Blob,URL,AbortSignal,importScripts(){},self:{navigator:{onLine:true},addEventListener(){},clients:{matchAll:async()=>[]},registration:{},nativeStorage:{read:async(k:string)=>structuredClone(records.get(k)),write:async(entries:any[])=>{for(const [k,v]of entries)records.set(k,structuredClone(v));}}},fetch:async(url:string,options:any)=>{
 if(String(url).includes('receipts='))return Response.json({email:'tech',receipts:mode==='all'?[{id:'root',operationId:'op',type:'action'},{id:'next',operationId:'op',type:'action'}]:mode==='root'?[{id:'root',operationId:'op',type:'action'}]:mode==='wrong-operation'?[{id:'root',operationId:'another',type:'action'},{id:'next',operationId:'another',type:'action'}]:[]});
 if(options.method){posted++;return Response.json({saved:true});}return Response.json({email:'tech',rows:[]});
 }});
 runInContext(readFileSync('public/field-offline/sw.js','utf8'),context);await runInContext('sync()',context);
 const confirmed=mode==='all'||mode==='root';
 assert.equal(records.get('tech:queue').length,confirmed?0:1);assert.equal(posted,mode==='root'?1:0);
 if(!confirmed)assert.equal(records.get('tech:queue')[0].discardedDependency,true);
});
