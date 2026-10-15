import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduleValueSummary} from '../lib/service-scheduling/value-summary';
test('values count each OS once by displayed status, track unknowns and preserve cents',()=>{
 const result=scheduleValueSummary([
 {order_value:'100.10',programming_status:'pending',operation_count:5},
 {order_value:'20.20',programming_status:'executing'},
 {order_value:'30.30',order_status:'Processado',programming_status:'pending'},
 {order_value:null,programming_status:'pending'},
 {order_value:'999',order_status:'Cancelado'},
 ]);
 assert.equal(result.total,150.6);assert.equal(result.completed,30.3);assert.equal(result.open,120.3);
 assert.equal(result.missing,1);assert.equal(result.openMissing,1);
 assert.deepEqual(result.stages.pending,{cents:10010,missing:1});
 assert.deepEqual(scheduleValueSummary([]).total,0);
});
