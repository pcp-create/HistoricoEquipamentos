import {test} from 'node:test';
import assert from 'node:assert/strict';
import {itemFinancials,proposalFinancials,proposalOrderDraft,discountedUnitCents} from '../lib/crm/financials';
import {proposalDraft,emptyDraft} from '../lib/crm/model';
import {parseOrder} from '../lib/service-orders/model';
const item:any={kind:'material',code:'1',name:'Filtro',quantity:'2',price:'12.00',unitCost:'5.00'};
test('CRM margins use sale as denominator, preserve missing costs and accept explicit zero costs',()=>{
 assert.deepEqual(itemFinancials(item),{sale:2400,cost:1000,profit:1400,margin:1400/2400*100});
 assert.equal(itemFinancials({...item,unitCost:''}).profit,null);
 assert.equal(itemFinancials({...item,unitCost:'0'}).profit,2400);
 assert.equal(itemFinancials({...item,price:'0'}).margin,null);
 assert.equal(itemFinancials({...item,unitCost:'15.00'}).profit,-600);
 assert.equal(proposalFinancials([item,{...item,kind:'service',unitCost:''}]).cost,null);
 assert.equal(proposalFinancials([item]).cost,1000);
 const draft=proposalDraft({...emptyDraft(),items:[item],commercial:{contact:'João',validity:'15 dias úteis'}});
 assert.equal(draft.items[0].unitCost,'5.00');assert.equal(draft.commercial?.contact,'João');
 assert.throws(()=>proposalDraft({...emptyDraft(),items:[{...item,unitCost:'-1'}]}));
 assert.throws(()=>proposalDraft({...emptyDraft(),items:[{...item,unitCost:'NaN'}]}));
 const order=parseOrder({...draft,company:'1',type:'6',customer:'10',serviceType:'1',origin:'1',seller:'1',payment:'1',situation:'1',flowStatus:'1',expected:'2026-11-30',delivery:'2026-11-30',freight:'1',notes:'Escopo'});
 assert.equal(order.items[0].unitCost,undefined);assert.equal(order.commercial,undefined);
});

test('per-item discounts update net sales, profit and ERP unit prices without modifying base prices',()=>{
 const discounted={...item,discountPercent:'10.00'};
 assert.equal(discountedUnitCents(discounted),1080);assert.equal(itemFinancials(discounted).sale,2160);assert.equal(itemFinancials(discounted).profit,1160);
 assert.equal(proposalFinancials([discounted,{...item,kind:'service',discountPercent:'50'}]).sale,3360);
 const draft=proposalDraft({...emptyDraft(),items:[discounted]});assert.equal(draft.items[0].discountPercent,'10.00');
 assert.equal(proposalOrderDraft({...emptyDraft(),items:[{...item,price:'12'}]}).items[0].price,'12');
 const request=proposalOrderDraft(draft);assert.equal(request.items[0].price,'10.80');assert.equal(request.items[0].discountPercent,undefined);assert.equal(draft.items[0].price,'12.00');
 assert.equal(itemFinancials({...item,discountPercent:'100'}).sale,0);assert.equal(itemFinancials({...item,discountPercent:'100'}).margin,null);
 assert.equal(itemFinancials({...item,quantity:'1.333',price:'1.01',discountPercent:'12.34'}).sale,Math.round(1.333*89));
 for(const discountPercent of ['-1','101','0.001','abc'])assert.throws(()=>proposalDraft({...emptyDraft(),items:[{...item,discountPercent}]}));
});
