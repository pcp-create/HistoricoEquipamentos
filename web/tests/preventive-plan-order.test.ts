import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderPreventivePlans,nextPreventivePlanId} from '../lib/equipment-management/plan-order';
const plan=(id:string,due:string|null,target:number|null,hours=2000)=>({id,document:{hours},forecast:{due,target}});
test('forecast date overrides received order and meter target, with unknown dates last',()=>{
 const plans=[plan('4000','2027-05-25',98468,4000),plan('unknown',null,1),plan('2000','2026-10-25',96468),plan('months','2026-10-20',null),plan('overdue','2026-09-01',99999)];
 const expected=['overdue','months','2000','4000','unknown'];
 assert.deepEqual(orderPreventivePlans(plans).map(p=>p.id),expected);
 assert.deepEqual(orderPreventivePlans([...plans].reverse()).map(p=>p.id),expected);
 assert.equal(nextPreventivePlanId(plans),'overdue');
 assert.equal(plans[0].id,'4000');
});
test('ties are deterministic and next label supports month-only plans',()=>{
 const plans=[plan('b','2026-12-01',null),plan('a','2026-12-01',null)];
 assert.deepEqual(orderPreventivePlans(plans).map(p=>p.id),['a','b']);
 assert.equal(nextPreventivePlanId(plans),'a');
 assert.equal(nextPreventivePlanId([plan('unknown',null,10)]),undefined);
});
