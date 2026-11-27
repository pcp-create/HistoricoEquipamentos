import test from 'node:test';
import assert from 'node:assert/strict';
import {orderConfirmation} from '../lib/crm/order-confirmation';
test('OS requires explicit payment confirmation and an approver',()=>{
 for(const input of [undefined,{}, {payment:'3',approver:'Ana'}, {payment:'3',paymentConfirmed:true,approver:'  '}])assert.throws(()=>orderConfirmation(input,'3'));
 assert.throws(()=>orderConfirmation({payment:'2',paymentConfirmed:true,approver:'Ana'},'3'));
 assert.throws(()=>orderConfirmation({payment:'',paymentConfirmed:true,approver:'Ana'},''));
});
test('confirmation preserves approved details and optional notes',()=>{
 assert.deepEqual(orderConfirmation({payment:'3',paymentConfirmed:true,approver:' Ana ',notes:' Entregar pela manhã '},'3'),{payment:'3',paymentConfirmed:true,approver:'Ana',notes:'Entregar pela manhã'});
 assert.equal(orderConfirmation({payment:'3',paymentConfirmed:true,approver:'Ana'},'3').notes,'');
 assert.throws(()=>orderConfirmation({payment:'3',paymentConfirmed:true,approver:'Ana',notes:'x'.repeat(2001)},'3'));
});
