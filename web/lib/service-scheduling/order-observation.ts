import {stagesOf} from './checklists';
import {operationNumber} from './operation-number';
import {orderServiceName,reportEquipmentParts} from './report-filename';
export function orderObservation(order:any,operations:any[],fallbackOrder?:string){
 const service=(orderServiceName(order)||'TIPO DA OS NÃO INFORMADO').toUpperCase();
 const number=String(order.numero_sequencia||fallbackOrder||order.order_id||'');
 return [...operations].sort((a,b)=>a.position-b.position).map(op=>{
  const doc=op.document||{},run=doc.checklistRun;
  const equipment=reportEquipmentParts(order,doc);
  let meter:unknown;
  if(run?.template&&(Array.isArray(run.template.stages)||Array.isArray(run.template.items)))for(const stage of stagesOf(run.template))for(const field of stage.fields)if(field.type==='meter'&&run.stages?.[stage.id]?.answers?.[field.id]!=null)meter=run.stages[stage.id].answers[field.id];
  const ht=typeof meter==='number'&&Number.isFinite(meter)?String(meter):'NÃO INFORMADO';
  return `${service} EM ${(equipment.description||'EQUIPAMENTO NÃO INFORMADO').toUpperCase()}${equipment.serial?' - SÉRIE '+equipment.serial:''}.\n\nREALIZADO ${service} - RELATÓRIO Nº ${number}/${operationNumber(op.position)} - HT: ${ht}`;
 }).join('\n\n');
}
export function appendOrderObservation(notes:string,standard:string){
 if(!standard)return notes;
 const missing=standard.split('\n\n').reduce<string[][]>((blocks,line,index)=>{if(index%2===0)blocks.push([line]);else blocks.at(-1)!.push(line);return blocks;},[]).map(block=>block.join('\n\n')).filter(block=>!notes.includes(block));
 return [notes.trim(),...missing].filter(Boolean).join('\n\n');
}
