import {pendingTechnicianClosures} from './execution-locks';
import 'server-only';
import {operationMeterEquipment} from './meter-equipment';
import {requireReportActivity} from './report-activity';
import {isChecklistEquipmentLinked} from './checklist-equipment';
import {validateAlertComments,reportSubmission,stagesOf,validateAnswers,validateFieldDetails} from './checklists';
function validateMeterDate(value:unknown): asserts value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))throw Error('Informe uma data válida para a leitura, sem data futura.');
}
export async function updateChecklist(c:any,b:any,operation:any,schedule:any,settings:any,email:string,admin:boolean,options:{returning?:boolean;submittingReport?:boolean}={}){
 const reviewing=b.action==='checklist_review_save';
 if(reviewing&&pendingTechnicianClosures(operation.document).length)throw Error('Aguarde o encerramento da operação por todos os técnicos antes de revisar o relatório.');
 if(reviewing&&(!admin||operation.status!=='awaiting_review'))throw Error('Somente o planejador pode corrigir o checklist enquanto aguarda revisão.');
 if(['completed','reviewed'].includes(operation.status)||operation.status==='awaiting_review'&&!reviewing)throw Error('A operação está concluída ou em revisão.');
 const assigned=operation.document.responsible===email;
 if(!admin&&!assigned)throw Error('Somente o técnico responsável pode preencher o checklist.');
 let run=structuredClone(operation.document.checklistRun);
 if(!run){
  const template=settings.checklists.find((t:any)=>t.id===operation.document.checklistId);
  if(!template)throw Error('Selecione e salve um checklist na operação.');
  run={template:structuredClone(template),stages:{},equipmentId:'',meterDate:''};
 }
 if(reportSubmission(run)&&b.action!=='checklist_reopen'&&!reviewing)throw Error('Relatório enviado. O planejador precisa reabrir a edição.');
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
  delete run.submission;
  run.stages[stage.id]={...previous,submittedAt:undefined,submittedBy:undefined,status:'released',reopenedAt:new Date().toISOString(),reopenedBy:email};
 }else if(['checklist_save','checklist_submit','checklist_review_save'].includes(b.action)){
  if(!reviewing&&operation.sent_at&&!((options.returning||options.submittingReport)&&b.action==='checklist_save'))await requireReportActivity(c,operation.id,email);
  if(previous.status!=='released'&&!(reviewing&&previous.status==='submitted'))throw Error('A etapa precisa estar liberada para preenchimento.');
  const answers=validateAnswers(stage,b.answers,b.action==='checklist_submit'||reviewing);
  const details=validateFieldDetails(stage,b.details??previous.details??{});
  if(reviewing||b.action==='checklist_submit')validateAlertComments(stage,answers,details);
  for(const f of stage.fields){
   const ids=[...((f.type==='photo'||f.type==='signature')?answers[f.id]||[]:[]),...(details[f.id]?.photos||[])];
   if(ids.length){const found=(await c.query('SELECT id FROM web_service_checklist_photos WHERE operation_id=$1 AND stage_id=$2 AND field_id=$3 AND id=ANY($4::bigint[])',[operation.id,stage.id,f.id,ids])).rows;
    if(found.length!==ids.length)throw Error('Foto não pertence a este campo da operação.');}
  }
  const meter=stage.fields.find(f=>f.type==='meter');
  if(meter&&answers[meter.id]!=null&&operationMeterEquipment(operation.document)){
   const equipmentId=b.equipmentId||run.equipmentId||operationMeterEquipment(operation.document);
   if(typeof equipmentId!=='string'||!/^\d{1,18}$/.test(equipmentId))throw Error('Selecione o equipamento vinculado à OS.');
   validateMeterDate(b.meterDate);
   if(run.equipmentId&&run.equipmentId!==equipmentId)throw Error('O equipamento desta leitura já foi definido.');
   const linked=await isChecklistEquipmentLinked(c,equipmentId,schedule.company_id,schedule.order_id,operation.document.equipmentId);
   if(!linked)throw Error('O equipamento selecionado não está vinculado à OS.');
   run.equipmentId=equipmentId;run.meterDate=b.meterDate;
  }
  run.stages[stage.id]={...previous,answers,details,status:b.action==='checklist_submit'||reviewing?'submitted':'released',updatedBy:email,updatedAt:new Date().toISOString(),...(b.action==='checklist_submit'?{submittedBy:email,submittedAt:new Date().toISOString()}:{})};
 }else throw Error('Ação de checklist inválida.');
 if(b.action==='checklist_save'){run.reportSavedAt=new Date().toISOString();run.reportSavedBy=email;}
 if(reviewing){run.reviewCorrectedAt=new Date().toISOString();run.reviewCorrectedBy=email;}
 const document={...operation.document,...(b.action==='checklist_reopen'?{technicianClosures:{}}:{}),checklistRun:run};
 const status=['checklist_save','checklist_submit'].includes(b.action)?'executing':operation.status;
 const result=(await c.query('UPDATE web_service_operations SET document=$2,status=$3,version=version+1,updated_at=now(),updated_by=$4 WHERE id=$1 RETURNING *',[operation.id,JSON.stringify(document),status,email])).rows[0];
 await c.query('INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,$2,$3,$4)',[operation.id,b.action,email,reviewing?'Correções do planejador na etapa '+stage.name:stage.name]);
 await c.query('INSERT INTO web_access_events(event,email,actor,details) VALUES($1,$2,$2,$3)',[b.action,email,JSON.stringify({operationId:operation.id,stageId:stage.id,before:previous,after:run.stages[stage.id]})]);
 return result;
}

// Individual stage submission is hidden in the pilot; full submission validates saved drafts.
export function prepareChecklistSubmission(run:any,email:string,operationDocument?:any){
 if(!run)throw Error('Preencha e salve o checklist antes do envio completo.');
 const next=structuredClone(run);
 for(const stage of stagesOf(next.template)){
  const saved=next.stages[stage.id];
  if(!saved||saved.status==='pending')throw Error(`Preencha e salve a etapa ${stage.name} antes do envio completo.`);
  validateAnswers(stage,saved.answers,true);
  if((operationDocument===undefined||operationMeterEquipment(operationDocument))&&stage.fields.some(field=>field.type==='meter'&&saved.answers[field.id]!=null)){
   if(!/^\d{1,18}$/.test(next.equipmentId||''))throw Error('Selecione o equipamento vinculado à OS e informe a data da leitura antes de enviar o relatório.');
   validateMeterDate(next.meterDate);
  }
  validateFieldDetails(stage,saved.details||{});
  validateAlertComments(stage,saved.answers,saved.details);
  next.stages[stage.id]={...saved,status:'submitted',submittedBy:saved.submittedBy||email,submittedAt:saved.submittedAt||new Date().toISOString()};
 }
 return next;
}

export async function reopenReport(c:any,operation:any,email:string,admin:boolean){
 if(!admin)throw Error('Somente o planejador pode devolver o relatório ao técnico.');
 if(['reviewed','completed'].includes(operation.status))throw Error('Relatórios já revisados ou operações concluídas não podem ser devolvidos por esta ação.');
 const run=structuredClone(operation.document.checklistRun);
 const receipt=reportSubmission(run);
 if(!receipt)throw Error('Somente relatórios enviados completos precisam ser devolvidos.');
 run.submissionHistory=[...(run.submissionHistory||[]),{...receipt,returnedAt:new Date().toISOString(),returnedBy:email}];
 delete run.submission;delete run.partialSubmission;delete run.reportSavedAt;
 run.reportReturnedAt=new Date().toISOString();run.reportReturnedBy=email;
 for(const stage of stagesOf(run.template)){
  const saved=run.stages[stage.id];
  if(saved?.status==='submitted')run.stages[stage.id]={...saved,status:'released',submittedAt:undefined,submittedBy:undefined,reopenedAt:run.reportReturnedAt,reopenedBy:email};
 }
 const result=(await c.query("UPDATE web_service_operations SET document=$2,status=CASE WHEN status='awaiting_review' THEN 'executing' ELSE status END,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1 RETURNING *",[operation.id,JSON.stringify({...operation.document,technicianClosures:{},checklistRun:run}),email])).rows[0];
 await c.query("INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,'report_reopen',$2,'Relatório devolvido ao técnico para edição')",[operation.id,email]);
 await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('report_reopen',$1,$1,$2)",[email,JSON.stringify({operationId:operation.id,submission:receipt})]);
 return result;
}
