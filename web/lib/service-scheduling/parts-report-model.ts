import {sameUnit} from '../product-values';
export type PartsReportRow = {
 scheduleId:string; key:string; company:number; order:string; customer:string; equipment:string; orderStatus:string; programmingStatus:string;
 sourceOrder:string; product:string; name:string; unit:string; quantity:number|null; withdrawn:number; used:number; needed:number;
 eligible:boolean; exclusion:string; collectedAt:string|null; stock:number|null; available:number|null; stockAt:string|null;
 purchases:{id:string;number:string;supplier:string;unit:string;quantity:number;date:string|null;status:string}[];
 purchasesComplete:boolean; purchasesAt:string|null; inconsistent:boolean;
 state?:string; action?:string; owner?:string;
};
export type PartsGroup={key:string;company:number;product:string;name:string;unit:string;orders:string[];needed:number;available:number|null;purchaseQuantity:number;toBuy:number|null;state:string;action:string;owner:string};
const number=(n:number)=>Math.round(n*1000)/1000;
export function summarizeParts(rows:PartsReportRow[],today:string){
 const groups:PartsGroup[]=[];
 const keyed=new Map<string,PartsReportRow[]>();
 for(const r of rows){
  if(!r.eligible){r.state=r.exclusion;r.owner='—';r.action='Registro informativo; não gerar compra ou separação.';continue;}
  if(r.needed===0&&!r.inconsistent){r.state='Retirada atendida';r.owner='Almoxarifado';r.action='Conferir utilização e eventuais devoluções; sem nova retirada prevista.';continue;}
  const key=`${r.company}:${r.product}:${r.unit.trim().toUpperCase()}`;keyed.set(key,[...(keyed.get(key)||[]),r]);
 }
 for(const [key,items] of keyed){
  const first=items[0],needed=number(items.reduce((n,r)=>n+r.needed,0));
  const unknown=items.some(r=>r.inconsistent||r.quantity==null||!r.collectedAt||r.available==null||!r.stockAt);
  const available=unknown?null:Math.min(...items.map(r=>Math.max(0,r.available!)));
  const allPurchases=[...new Map(items.flatMap(r=>r.purchases).map(p=>[`${p.id}:${p.unit}:${p.date}`,p])).values()];
  const purchases=allPurchases.filter(p=>sameUnit(p.unit,first.unit));
  const unitConflict=allPurchases.some(p=>!sameUnit(p.unit,first.unit));
  const quantity=number(purchases.reduce((n,p)=>n+p.quantity,0));
  const complete=items.every(r=>r.purchasesComplete);
  const shortage=available==null?null:Math.max(0,number(needed-available));
  const toBuy=shortage==null||!complete||(unitConflict&&shortage>0)?null:Math.max(0,number(shortage-quantity));
  let state='Disponível para separar',owner='Almoxarifado',action='Validar reservas e distribuir o saldo disponível entre as OSs; separar e registrar retirada.';
  if(unknown){state='Conferir dados';owner='Almoxarifado / Planejamento';action='Confirmar coleta da OS, quantidade, unidade e saldo de estoque antes de liberar ou comprar.';}
  else if(shortage!>0){
   owner='Compras';
   if(unitConflict){state='Conferir unidade da compra';action='Confirmar a conversão entre a unidade da OC e a unidade do material antes de complementar a compra.';}
   else if(!complete){state='Compras não confirmadas';action='Atualizar a integração de compras e confirmar o saldo pendente antes de emitir nova OC.';}
   else if(toBuy!>0){state=quantity>0?'Complementar compra':'Comprar';action=`Validar reservas e providenciar ${toBuy!.toLocaleString('pt-BR')} ${first.unit} para a demanda consolidada.${quantity>0?' Acompanhar também as OCs já abertas.':''}`;}
   else if(purchases.some(p=>!p.date)){state='Compra sem prazo';action='Obter a previsão de entrega do fornecedor e atualizar a OC.';}
   else if(purchases.some(p=>p.date!<today)){state='Compra atrasada';action='Cobrar o fornecedor, confirmar entrega física e atualizar o prazo da OC.';}
   else {state='Aguardando compra';owner='Compras / Almoxarifado';action='Acompanhar as chegadas indicadas, conferir o recebimento e distribuir os materiais entre as OSs.';}
  }
  const group={key,company:first.company,product:first.product,name:first.name,unit:first.unit,orders:[...new Set(items.map(r=>r.order))],needed,available,purchaseQuantity:quantity,toBuy,state,action,owner};
  groups.push(group);for(const r of items){r.state=state;r.owner=owner;r.action=action;}
 }
 return groups.sort((a,b)=>a.company-b.company||a.name.localeCompare(b.name,'pt-BR'));
}
