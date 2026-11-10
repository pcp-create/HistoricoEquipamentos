import {stagesOf} from './checklists';

/** Only the operation's explicit equipment can receive a collection. */
export function operationMeterEquipment(document:any):string {
 const id=document?.equipmentId;
 return !document?.equipmentUnassigned&&/^\d{1,18}$/.test(String(id||''))?String(id):'';
}
export const unlinkedMeterMessage='Operação sem equipamento vinculado: o horímetro fica registrado somente no relatório. Nenhuma coleta de horímetro ou atualização de preventiva será atribuída a equipamento.';
export function unlinkedMeterWarning(document:any):string {
 const run=document?.checklistRun;
 if(operationMeterEquipment(document)||!run?.template)return '';
 return stagesOf(run.template).some(stage=>stage.fields.some(field=>field.type==='meter'&&run.stages?.[stage.id]?.answers?.[field.id]!=null))?unlinkedMeterMessage:'';
}
