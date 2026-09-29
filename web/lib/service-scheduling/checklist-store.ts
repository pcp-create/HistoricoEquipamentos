import 'server-only';
import {stagesOf,validateAnswers,validateFieldDetails} from './checklists';
export async function updateChecklist(c:any,b:any,operation:any,schedule:any,settings:any,email:string,admin:boolean){
 if(['completed','reviewed','awaiting_review'].includes(operation.status))throw Error('A operação está concluída ou em revisão.');
 const assigned=operation.document.responsible===email||operation.document.support?.includes(email);
 if(!admin&&!assigned)throw Error('Somente a equipe atribuída pode preencher o checklist.');
 let run=structuredClone(operation.document.checklistRun);
 if(!run){
  const template=settings.checklists.find((t:any)=>t.id===operation.document.checklistId);
  if(!template)throw Error('Selecione e salve um checklist na operação.');
  run={template:structuredClone(template),stages:{},equipmentId:'',meterDate:''};
 }
 const stage=stagesOf(run.template).find(s=>s.id===b.stageId);
 if(!stage)throw Error('Etapa não encontrada.');
 const previous=run.stages[stage.id]||{status:'pending',answers:{}};
 if(b.action==='checklist_release'){
  if(!admin)throw Error('Somente administradores podem liberar etapas.');
  if(!operation.document.responsible)throw Error('Atribua um responsável à operação antes de liberar a etapa.');
  if(previous.status!=='pending')throw Error('Etapa já liberada.');
  run.stages[stage.id]={...previous,status:'released',releasedAt:new Date().toISOString(),releasedBy:email};
 }else if(b.action==='checklist_reopen'){
  if(!admin||previous.status!=='submitted')throw Error('Somente administradores podem reabrir etapas devolvidas.');
  run.stages[stage.id]={...previous,status:'released',reopenedAt:new Date().toISOString(),reopenedBy:email};
 }else if(['checklist_save','checklist_submit'].includes(b.action)){
  if(previous.status!=='released')throw Error('A etapa precisa estar liberada para preenchimento.');
  const answers=validateAnswers(stage,b.answers,b.action==='checklist_submit');
  const details=validateFieldDetails(stage,b.details??previous.details??{});
  for(const f of stage.fields){
   const ids=[...((f.type==='photo'||f.type==='signature')?answers[f.id]||[]:[]),...(details[f.id]?.photos||[])];
   if(ids.length){const found=(await c.query('SELECT id FROM web_service_checklist_photos WHERE operation_id=$1 AND stage_id=$2 AND field_id=$3 AND id=ANY($4::bigint[])',[operation.id,stage.id,f.id,ids])).rows;
    if(found.length!==ids.length)throw Error('Foto não pertence a este campo da operação.');}
  }
  const meter=stage.fields.find(f=>f.type==='meter');
  if(meter&&answers[meter.id]!=null){
   if(typeof b.equipmentId!=='string'||!/^\d{1,18}$/.test(b.equipmentId))throw Error('Selecione o equipamento vinculado à OS.');
   if(typeof b.meterDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.meterDate)||!Number.isFinite(Date.parse(b.meterDate))||new Date(b.meterDate).toISOString().slice(0,10)!==b.meterDate||b.meterDate>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))throw Error('Informe uma data válida para a leitura, sem data futura.');
   if(run.equipmentId&&run.equipmentId!==b.equipmentId)throw Error('O equipamento desta leitura já foi definido.');
   const linked=(await c.query(`SELECT e.equipment_id FROM m8_equipment_catalog e WHERE e.equipment_id=$1 AND e.present AND EXISTS(SELECT 1 FROM m8_order_equipment_links l WHERE l.equipment_id=e.equipment_id AND l.company_id=$2 AND l.order_id=$3 AND NOT l.stale) FOR UPDATE`,[b.equipmentId,schedule.company_id,schedule.order_id])).rows[0];
   if(!linked)throw Error('O equipamento selecionado não está vinculado à OS.');
   run.equipmentId=b.equipmentId;run.meterDate=b.meterDate;
  }
  run.stages[stage.id]={...previous,answers,details,status:b.action==='checklist_submit'?'submitted':'released',updatedBy:email,updatedAt:new Date().toISOString(),...(b.action==='checklist_submit'?{submittedBy:email,submittedAt:new Date().toISOString()}:{})};
 }else throw Error('Ação de checklist inválida.');
 const document={...operation.document,checklistRun:run};
 const status=['checklist_save','checklist_submit'].includes(b.action)?'executing':operation.status;
 const result=(await c.query('UPDATE web_service_operations SET document=$2,status=$3,version=version+1,updated_at=now(),updated_by=$4 WHERE id=$1 RETURNING *',[operation.id,JSON.stringify(document),status,email])).rows[0];
 await c.query('INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,$2,$3,$4)',[operation.id,b.action,email,stage.name]);
 await c.query('INSERT INTO web_access_events(event,email,actor,details) VALUES($1,$2,$2,$3)',[b.action,email,JSON.stringify({operationId:operation.id,stageId:stage.id,before:previous,after:run.stages[stage.id]})]);
 return result;
}

// Individual stage submission is hidden in the pilot; full submission validates saved drafts.
export function prepareChecklistSubmission(run:any,email:string){
 if(!run)throw Error('Preencha e salve o checklist antes do envio completo.');
 const next=structuredClone(run);
 for(const stage of stagesOf(next.template)){
  const saved=next.stages[stage.id];
  if(!saved||saved.status==='pending')throw Error(`Preencha e salve a etapa ${stage.name} antes do envio completo.`);
  validateAnswers(stage,saved.answers,true);
  validateFieldDetails(stage,saved.details||{});
  next.stages[stage.id]={...saved,status:'submitted',submittedBy:saved.submittedBy||email,submittedAt:saved.submittedAt||new Date().toISOString()};
 }
 return next;
}
