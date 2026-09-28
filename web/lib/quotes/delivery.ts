import type {QuoteItem} from './types';
/** Availability is evaluated in the proposal's company and matching unit. */
export function deliveryDeadline(item:QuoteItem,company:string):string {
 if(item.kind!=='material')return '';
 const product=item.products?.find(p=>String(p.company_id)===company && p.product_id===item.code);
 const available=product?.current?.available;
 const unit=(product?.current?.unit||product?.unit||'').trim().toUpperCase();
 const quantity=Number(item.quantity);
 return available!=null && String(available).trim()!=='' && Number.isFinite(Number(available)) &&
 Number.isFinite(quantity) && quantity>0 && unit!=='' && unit===item.unit.trim().toUpperCase() &&
 product?.blocked!=='Sim' && Number(available)>=quantity ? 'Imediato' : 'À consultar';
}
