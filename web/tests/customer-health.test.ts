import {test} from 'node:test';import assert from 'node:assert/strict';import {customerHealth} from '../lib/equipment-management/customer-health';
test('customer signal never marks missing or inconsistent preventive data green',()=>{
 assert.equal(customerHealth({plans:0}).key,'unknown');
 assert.equal(customerHealth({plans:1,forecast:{status:'scheduled',inconsistent:true}}).key,'unknown');
 assert.equal(customerHealth({plans:1,forecast:{status:'scheduled'}}).key,'ok');
 assert.equal(customerHealth({plans:1,forecast:{status:'overdue'}}).key,'critical');
 assert.equal(customerHealth({plans:1,forecast:{status:'due'}}).key,'critical');
 assert.equal(customerHealth({plans:1,forecast:{status:'soon'}}).key,'attention');
 assert.equal(customerHealth({plans:1,forecast:{status:'scheduled'},openOrders:[{}]}).key,'attention');
 assert.equal(customerHealth({plans:1,forecast:{status:'overdue'},workshop:{}}).key,'workshop');
});
