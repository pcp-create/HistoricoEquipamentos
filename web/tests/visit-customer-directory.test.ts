import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visitCustomerDirectory} from '../lib/visits/customer-directory';
test('complete directory includes and searches leads from all sellers without equipment requirements',async()=>{
 const g=globalThis as any,old=g.historyPool;
 g.historyPool={query:async(sql:string,args:any[])=>{assert.ok(!sql.includes('m8_person_equipment'));return sql.includes('web_sales_leads')?(assert.ok(!sql.includes('WHERE l.owner')),assert.equal(args,undefined),{rows:[{id:'abc',name:'Prospect',owner:'seller@test',owner_name:'Vendedor A',city:'Lages',uf:'SC'},{id:'def',name:'Outro prospect',owner:'other@test',owner_name:'Vendedor B',city:'Turvo',uf:'SC'}]}):{rows:[{person_id:'1',name:'Cliente ERP',document:'123',payload:{}}]};}};
 try{
 const all=await visitCustomerDirectory();assert.equal(all.customers?.length,3);
 const found=await visitCustomerDirectory('Outro prospect');assert.equal(found.rows?.length,1);assert.equal(found.rows?.[0].data.key,'lead:def');assert.deepEqual(found.rows?.[0].data.seller_ids,['other@test']);assert.deepEqual(found.rows?.[0].data.seller_names,['Vendedor B']);
 }finally{g.historyPool=old;}
});
