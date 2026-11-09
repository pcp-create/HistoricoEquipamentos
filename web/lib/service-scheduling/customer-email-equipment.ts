import {operationNumber} from './operation-number';
/** Number distinct selected assets in operation order, never by an unselected operation. */
export function customerEmailEquipment(order:any,operations:any[]){
 const labels:string[]=[],lines:string[]=[],seen=new Set<string>();
 for(const [index,operation] of [...operations].sort((a,b)=>Number(a.position||0)-Number(b.position||0)).entries()){
  const doc=operation.document||{},equipment=doc.equipment||{};
  const orderId=order.produto_equipamento_id??order.payload?.produtoEquipamentoId;
  const sameOrderAsset=!doc.equipmentId||(orderId!=null&&String(doc.equipmentId)===String(orderId));
  let label=String(equipment.label||equipment.name||equipment.model||(sameOrderAsset?order.equipamento:'')||'Equipamento não informado').replace(/\s+/g,' ').trim();
  const serial=String(equipment.serial||(sameOrderAsset?(order.numero_serie||order.serie):'')||'').replace(/\s+/g,' ').trim();
  if(serial&&!label.toLowerCase().includes(serial.toLowerCase()))label+=' · Série '+serial;
  if(doc.equipmentUnassigned)label='Sem equipamento específico';
  lines.push('· OP'+operationNumber(operation.position??index+1)+' - '+label);
  const key=doc.equipmentUnassigned?'unassigned':doc.equipmentId?'id:'+doc.equipmentId:'label:'+label.toLowerCase();
  if(seen.has(key))continue;seen.add(key);labels.push(label);
 }
 const values:Record<string,string>={equipamento:lines.join('\n')};
 labels.forEach((label,index)=>{values['equipamento_'+String(index+1).padStart(2,'0')]=label;});
 return values;
}
/** Older saved templates also need to identify the assets included in this report. */
export function equipmentEmailBodyTemplate(template:string){
 return /\{equipamento(?:_\d{2,3})?\}/.test(template)?template:template+'\n\nEquipamentos atendidos:\n{equipamento}';
}
