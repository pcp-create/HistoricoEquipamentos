import {test} from 'node:test';
import assert from 'node:assert/strict';
import {belowMinimumPrices} from '../lib/crm/minimum-price-review';
import type {OrderItem} from '../lib/service-orders/model';

test('minimum-price review uses the net unit price and fails closed when unavailable',()=>{
 const item:OrderItem={kind:'material',code:'11958',name:'Produto',quantity:'1',price:'510.00',discountPercent:'10'};
 assert.deepEqual(belowMinimumPrices([item],new Map([['11958',510]])),[{code:'11958',name:'Produto',saleCents:45900,minimumCents:51000}]);
 assert.deepEqual(belowMinimumPrices([{...item,discountPercent:'0'}],new Map([['11958',510]])),[]);
 assert.throws(()=>belowMinimumPrices([item],new Map()),/indisponível/);
 assert.deepEqual(belowMinimumPrices([{...item,kind:'service'}],new Map()),[]);
});
