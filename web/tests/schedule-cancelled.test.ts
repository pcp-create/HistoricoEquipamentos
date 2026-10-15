import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayedScheduleStatus} from '../lib/service-scheduling/display-status';
import {matchesDeliveryProjection,isCarriedDelivery} from '../lib/service-scheduling/delivery-projection';
test('ERP cancellation overrides operation status and is not carried into later months',()=>{
 for(const order_status of ['Cancelado','Cancelada',' CANCELADO ']){
  const order={order_status,programming_status:'executing',expected_delivery_date:'2026-09-30'};
  assert.equal(displayedScheduleStatus(order),'cancelled');
  assert.equal(matchesDeliveryProjection(order,'2026-09'),true);
  assert.equal(matchesDeliveryProjection(order,'2026-10'),false);
  assert.equal(matchesDeliveryProjection(order,''),true);
  assert.equal(isCarriedDelivery(order,'2026-10'),false);
 }
 assert.equal(displayedScheduleStatus({order_status:'Processado',programming_status:'pending'}),'completed');
});
