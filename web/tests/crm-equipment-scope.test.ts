import test from 'node:test';
import assert from 'node:assert/strict';
import {orderLookups} from '../lib/service-orders/lookups';

test('proposal equipment scope follows its proposal type rather than the OS type', async () => {
 const state=globalThis as any;
 const previous=state.historyPool;
 try {
  for (const restricted of [true,false]) {
   state.historyPool={query:async(sql:string,params:any[])=>{
    if(sql.includes('FROM crm_proposals'))return {rows:[{customer_id:123,customer_equipment_only:restricted}]};
    assert.ok(!sql.includes('FROM m8_order_type_catalog'),'proposal must not use OS configuration');
    assert.equal(params[1],restricted);
    assert.equal(String(params[2]),'123');
    return {rows:[]};
   }};
   await orderLookups(new URLSearchParams({lookup:'proposal-equipment',proposal:'12345678-1234-1234-1234-123456789abc',customer:'123',type:'2'}));
  }
 } finally {state.historyPool=previous;}
});
