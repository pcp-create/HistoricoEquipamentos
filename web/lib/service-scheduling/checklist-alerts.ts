import { requiresAlertComment, stagesOf } from './checklists';
export type ChecklistAlert = {stageId:string;fieldId:string;stage:string;label:string;value:string;comment?:string};
export function checklistAlerts(run:any):ChecklistAlert[] {
 if(!run?.template)return [];
 return stagesOf(run.template).flatMap(stage=>stage.fields.flatMap(field=>{
  const value=run.stages?.[stage.id]?.answers?.[field.id];
  return requiresAlertComment(field,value)
   ? [{stageId:stage.id,fieldId:field.id,stage:stage.name,label:field.label,value,comment:run.stages?.[stage.id]?.details?.[field.id]?.comment||''}] : [];
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

export const alertKey=(a:ChecklistAlert)=>JSON.stringify([a.stageId,a.fieldId,a.value]);
export function pendingChecklistAlerts(document:any,alerts:ChecklistAlert[]){
 const covered=new Set((document.checklistAlertTasks||[]).flatMap((task:any)=>(task.alerts||[]).map(alertKey)));
 // Older task records have the aggregate signature as their primary identity.
 if(existingAlertTask(document,alerts))return [];
 return alerts.filter(a=>!covered.has(alertKey(a)));
}
export function validateAlertTaskGroups(alerts:ChecklistAlert[],input:any,requireAll=true){
 if(!alerts.length)return [];
 const groups=Array.isArray(input)?input:[{...input,alertKeys:alerts.map(alertKey)}];
 if(!groups.length||groups.length>alerts.length)throw Error('Distribua todos os alertas entre as tarefas.');
 const seen=new Set<string>();
 const result=groups.map(group=>{
  const task=validateAlertTask(group);
  if(!Array.isArray(group.alertKeys)||!group.alertKeys.length)throw Error('Selecione ao menos um alerta para cada tarefa.');
  const selected=group.alertKeys.map((key:any)=>{
   const alert=alerts.find(a=>alertKey(a)===key);
   if(!alert||seen.has(key))throw Error('Cada alerta deve pertencer a uma única tarefa. Confira a seleção.');
   seen.add(key);return alert;
  });
  return {...task,alerts:selected};
 });
 if(requireAll&&seen.size!==alerts.length)throw Error('Distribua todos os alertas entre as tarefas antes de concluir a revisão.');
 return result;
}
