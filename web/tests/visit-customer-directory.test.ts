import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visitCustomerDirectory} from '../lib/visits/customer-directory';
test('complete directory searches customers and the selected seller leads',async()=>{
 const g=globalThis as any,old=g.historyPool;
 g.historyPool={query:async(sql:string,args:any[])=>sql.includes('web_sales_leads')?(assert.deepEqual(args,['seller@test']),{rows:[{id:'abc',name:'Prospect',owner:'seller@test',city:'Lages',uf:'SC'}]}):{rows:[{person_id:'1',name:'Cliente ERP',document:'123',payload:{}}]}};
 try{
 const all=await visitCustomerDirectory(null,1,'seller@test');assert.equal(all.customers?.length,2);
 const found=await visitCustomerDirectory('Prospect',1,'seller@test');assert.equal(found.rows?.length,1);assert.equal(found.rows?.[0].data.key,'lead:abc');assert.equal(found.rows?.[0].data.lead,true);assert.deepEqual(found.rows?.[0].data.seller_ids,['seller@test']);
 }finally{g.historyPool=old;}
});
