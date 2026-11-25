import {itemFinancials} from './financials';
import {parseQuote,blankQuote} from '../quotes/types';
import type {OrderDraft} from '../service-orders/model';
export class CrmError extends Error {}
export const uuid=(v:unknown)=>{if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new CrmError('Identificador inválido.');return v;};
export function text(v:unknown,max=200,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new CrmError('Confira os campos obrigatórios e o tamanho dos textos.');return v.trim();}
export function positive(v:unknown){if(!/^[1-9]\d{0,9}$/.test(String(v))||Number(v)>2147483647)throw new CrmError('Identificador numérico inválido.');return Number(v);}
export function version(v:unknown){if(!Number.isSafeInteger(v)||Number(v)<1)throw new CrmError('Versão inválida.');return Number(v);}
export const emptyDraft=():OrderDraft=>({company:'',type:'',customer:'',equipment:'',serviceType:'',origin:'',seller:'',technician:'',payment:'',expected:'',delivery:'',situation:'',flowStatus:'',freight:'',notes:'',internalNotes:'',items:[],extra:{}});
/** Drafts may be incomplete. Full ERP validation runs only before conversion. */
export function proposalDraft(raw:any):OrderDraft {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new CrmError('Dados da proposta inválidos.');
 const out=emptyDraft();
 for(const k of Object.keys(out).filter(k=>!['items','extra'].includes(k))) (out as any)[k]=text(raw[k]??'',k==='notes'||k==='internalNotes'?20000:150);
 if(!Array.isArray(raw.items)||raw.items.length>200)throw new CrmError('Use até 200 itens na proposta.');
 out.items=raw.items.map((r:any)=>{
  if(!r||!['material','service'].includes(r.kind))throw new CrmError('Item inválido.');
  const quantity=text(r.quantity,20,true),price=text(r.price,20,true);
  if(!/^\d{1,7}(\.\d{1,3})?$/.test(quantity)||Number(quantity)<=0||!/^\d{1,8}(\.\d{1,2})?$/.test(price)||Number(quantity)*Number(price)>100000000)throw new CrmError('Confira quantidades e valores dos itens.');
  const discountPercent=text(r.discountPercent??'',6);
  if(discountPercent&&(!/^\d{1,3}(\.\d{1,2})?$/.test(discountPercent)||Number(discountPercent)>100))throw new CrmError('Informe um desconto de 0 a 100%, com até duas casas decimais.');
  const unitCost=text(r.unitCost??'',20);
  if(unitCost&&(!/^\d{1,8}(\.\d{1,6})?$/.test(unitCost)||Number(quantity)*Number(unitCost)>100000000))throw new CrmError('Confira o custo unitário dos itens.');
  const quote=r.quote?parseQuote({...blankQuote(),items:[{...r.quote,kind:r.kind,code:r.code,name:r.name,quantity,price,selected:true}]}).items[0]:undefined;
  return {deliveryLeadTime:text(r.deliveryLeadTime??'',100),discountPercent,unitCost,...(quote?{quote}:{}),kind:r.kind,code:String(positive(r.code)),name:text(r.name,500,true),quantity,price,notes:text(r.notes??'',20000),internalNotes:text(r.internalNotes??'',20000)};
 });
 if(raw.commercial!==undefined){
  if(!raw.commercial||typeof raw.commercial!=='object'||Array.isArray(raw.commercial))throw new CrmError('Condições comerciais inválidas.');
  out.commercial=Object.fromEntries(['contact','phone','validity','sellerName','sellerEmail','sellerPhone','paymentName','freightName','carrier','deliveryDays','taxBudgetType'].filter(k=>Object.hasOwn(raw.commercial,k)).map(k=>[k,text(raw.commercial[k],500)]));
  for(const k of ['backupEnabled','backupDays','backupRentalIncluded','backupRentalValue','backupTerms'])if(Object.hasOwn(raw.commercial,k))out.commercial[k]=text(raw.commercial[k],k==='backupTerms'?4000:30);
  for(const k of ['backupEnabled','backupRentalIncluded'])if(out.commercial[k]&&!['yes','no'].includes(out.commercial[k]))throw new CrmError('Confira as opções de equipamento backup.');
  if(out.commercial.backupDays&&!/^[1-9]\d{0,3}$/.test(out.commercial.backupDays))throw new CrmError('Informe o prazo de utilização entre 1 e 9999 dias.');
  if(out.commercial.backupRentalValue&&!/^\d{1,8}(\.\d{1,2})?$/.test(out.commercial.backupRentalValue))throw new CrmError('Confira o valor da locação embutida.');
  if(out.commercial.backupEnabled==='yes'&&out.commercial.backupRentalIncluded==='yes'&&!out.commercial.backupRentalValue)throw new CrmError('Informe o valor da locação embutida.');
 }
 if(out.commercial?.deliveryDays&&!/^\d{1,4}$/.test(out.commercial.deliveryDays))throw new CrmError('Informe o prazo de entrega em dias úteis (0 a 9999).');
 if(out.commercial?.taxBudgetType)positive(out.commercial.taxBudgetType);
 if(raw.extra){if(typeof raw.extra!=='object'||Array.isArray(raw.extra)||Object.keys(raw.extra).length>100)throw new CrmError('Campos adicionais inválidos.');out.extra=Object.fromEntries(Object.entries(raw.extra).map(([k,v])=>[text(k,100,true),text(v,10000)]));}
 return out;
}
export function totalCents(d:OrderDraft){return d.items.reduce((n,i)=>n+itemFinancials(i).sale,0);}
export const conversionRate=(opportunities:number,converted:number)=>opportunities?Math.round(converted/opportunities*1000)/10:0;
