import { isStatusField, fieldOptions, stagesOf } from './checklists';
export type ChecklistAlert = {stageId:string;fieldId:string;stage:string;label:string;value:string};
export function checklistAlerts(run:any):ChecklistAlert[] {
 if(!run?.template)return [];
 return stagesOf(run.template).flatMap(stage=>stage.fields.flatMap(field=>{
  const value=run.stages?.[stage.id]?.answers?.[field.id];
  return isStatusField(field.type)&&typeof value==='string'&&fieldOptions(field).includes(value)&&field.alertOptions?.includes(value)
   ? [{stageId:stage.id,fieldId:field.id,stage:stage.name,label:field.label,value}] : [];
 }));
}
export function checklistAlertSignature(alerts:ChecklistAlert[]){return JSON.stringify(alerts.map(a=>[a.stageId,a.fieldId,a.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
export function existingAlertTask(document:any,alerts:ChecklistAlert[]){return document.checklistAlertTasks?.find((t:any)=>t.signature===checklistAlertSignature(alerts));}
export function validateAlertTask(input:any){
 if(!input||typeof input.assignedTo!=='string'||!input.assignedTo.trim())throw Error('Escolha um responsável para a tarefa dos alertas antes de concluir a revisão.');
 if(typeof input.description!=='string'||!input.description.trim()||input.description.length>8000)throw Error('Descreva a tarefa dos alertas (até 8.000 caracteres).');
 if(!['complete','summary','budget'].includes(input.reportMode))throw Error('Selecione o tipo de relatório para anexar à tarefa.');
 return {assignedTo:input.assignedTo.trim().toLowerCase(),description:input.description.trim(),reportMode:input.reportMode as 'complete'|'summary'|'budget'};
}
