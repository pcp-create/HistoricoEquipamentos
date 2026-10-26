import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncCustomerCommercial} from '../src/sync/customerCommercial.js';

for(const drainInitial of [false,true])test(`initial backlog draining: ${drainInitial}`,async()=>{
 const modes:boolean[]=[];const requests:string[]=[];
 const db={query:async(sql:string,params?:any[])=>{
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{ok:true}]};
  if(sql.includes('catalog_at>'))return {rows:[{}]};
  if(sql.includes('SELECT person_id::text')){modes.push(params![1]);assert.match(sql,/checked_at IS NULL AND error IS NULL/);return {rows:modes.length<=2?[{person_id:String(modes.length)}]:[]};}
  return {rows:[]};
 }};
 const client={company:1,get:async(path:string)=>{requests.push(path);return {data:path.endsWith('/vendedor')?[]:{razaoSocial:'Cliente'},errors:[]};}};
 const result=await syncCustomerCommercial(client as any,db as any,{maxPeople:1,drainInitial});
 assert.equal(result.checked,drainInitial?2:1);assert.deepEqual(modes,drainInitial?[false,true,true]:[false]);
 assert.equal(requests.length,drainInitial?4:2);
});
