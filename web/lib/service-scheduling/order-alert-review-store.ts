import 'server-only';
import {canViewTask,taskAdministrator} from '../tasks/privacy';
import {createAlertGroup} from './checklist-alert-task';
import {orderAlertReportPdf} from './order-alert-report';
import type {ReportMode} from './checklist-report';
import {validateAlertTaskGroups,pendingChecklistAlerts,type ChecklistAlert} from './checklist-alerts';
import {orderAlertDocument,orderChecklistAlerts,orderReviewSignature,readOrderReview} from './order-review';

/** Caller holds the scheduling lock and transaction; tasks, attachments and receipt commit together. */
export async function concludeOrderReview(c:any,schedule:any,settings:any,email:string,input:any){
 const operations=(await c.query('SELECT * FROM web_service_operations WHERE schedule_id=$1 ORDER BY position,id FOR UPDATE',[schedule.id])).rows;
 if(input.signature!==orderReviewSignature(operations))throw Error('A OS foi alterada. Atualize a revisão e confira os alertas antes de concluir.');
 if(!operations.length||operations.some((o:any)=>!['reviewed','completed'].includes(o.status)))throw Error('Conclua a revisão de todas as operações antes de concluir a revisão da OS.');
 const previous=await readOrderReview(c,String(schedule.id));
 const records=orderAlertDocument(operations,previous).checklistAlertTasks;
 const ids=records.map((t:any)=>String(t.taskId));
 const live=new Set(ids.length?(await c.query('SELECT id::text FROM web_tasks WHERE id=ANY($1::bigint[])',[ids])).rows.map((t:any)=>String(t.id)):[]);
 const kept=records.filter((t:any)=>live.has(String(t.taskId)));
 const pending=pendingChecklistAlerts({checklistAlertTasks:kept},orderChecklistAlerts(operations));
 if(previous?.signature===orderReviewSignature(operations)&&!pending.length)return {orderReview:previous};
 const groups=validateAlertTaskGroups(pending,input.alertTasks,true,true);
 const reportCache=new Map<ReportMode,Awaited<ReturnType<typeof orderAlertReportPdf>>>();
 const actor=(await c.query('SELECT display_name FROM web_user_access WHERE email=$1',[email])).rows[0];
 async function attachOrderReport(taskId:string,mode:ReportMode){
  let pdf=reportCache.get(mode);
  if(!pdf){pdf=await orderAlertReportPdf(c,schedule,operations,settings,mode);reportCache.set(mode,pdf);}
  await c.query('INSERT INTO web_task_attachments(task_id,filename,content_type,content,created_by,created_name) VALUES($1,$2,$3,$4,$5,$6)',[taskId,pdf.filename,'application/pdf',Buffer.from(pdf.bytes),email,actor?.display_name||email]);
 }
 // Finalize preliminary reports from the earlier flow as one complete OS report.
 for(const task of kept){
  const preview=await c.query("SELECT 1 FROM web_task_attachments WHERE task_id=$1 AND (filename LIKE 'Relatorio-OS-%-Operacao-%-Previo.pdf' OR filename LIKE 'OS %-Previo.pdf') LIMIT 1",[task.taskId]);
  if(!preview.rows.length)continue;
  await c.query("DELETE FROM web_task_attachments WHERE task_id=$1 AND (filename LIKE 'Relatorio-OS-%-Operacao-%-Previo.pdf' OR filename LIKE 'OS %-Previo.pdf')",[task.taskId]);
  await attachOrderReport(String(task.taskId),task.reportMode);
 }
 const order=(await c.query('SELECT numero_sequencia FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2',[schedule.company_id,schedule.order_id])).rows[0];
 for(const group of groups){
  if(!group.alerts.length)throw Error('Selecione ao menos um alerta para cada tarefa da OS.');
  if('existingTaskId' in group && group.existingTaskId){
   const existing=(await c.query("SELECT id::text,title,status,assigned_to,followers,to_jsonb(web_tasks)->>'restricted' AS restricted FROM web_tasks WHERE id=$1 FOR UPDATE",[group.existingTaskId])).rows[0];
   if(!existing||!canViewTask(existing,email,await taskAdministrator(email,c)))throw Error('Tarefa não encontrada ou indisponível para este usuário.');
   const note=group.alerts.map((a:ChecklistAlert)=>`Operação ${String(a.operationPosition).padStart(2,'0')} · ${a.stage} · ${a.label}: ${a.value}\nComentário: ${a.comment||'Não informado'}`).join('\n');
   await c.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,true,$4,$5)",[existing.id,`Alertas vinculados da OS ${order?.numero_sequencia||schedule.order_id}`,note,email,actor?.display_name||email]);
   await attachOrderReport(existing.id,'complete');
   const prior=kept.find((t:any)=>String(t.taskId)===existing.id);
   if(prior)prior.alerts=[...(prior.alerts||[]),...group.alerts];
   else kept.push({taskId:existing.id,alerts:group.alerts,assignedTo:existing.assigned_to,reportMode:'complete',existingTask:true,at:new Date().toISOString(),by:email});
   continue;
  }
  let taskId:string|undefined,record:any;
  const positions:number[]=[];
  for(const o of operations){
   const alerts=group.alerts.filter((a:ChecklistAlert)=>a.operationId===String(o.id)).map(({operationId,operationPosition,...a}:ChecklistAlert)=>a);
   if(!alerts.length)continue;
   const document=await createAlertGroup(c,o,schedule,o.document,settings,email,alerts,group,taskId,false);
   record=document.checklistAlertTasks.at(-1);
   taskId=String(record.taskId);positions.push(o.position);
  }
  if(taskId){
   await attachOrderReport(taskId,group.reportMode);
   await c.query('UPDATE web_tasks SET title=$2 WHERE id=$1',[taskId,`Alertas da OS ${order?.numero_sequencia||schedule.order_id} · Operações ${positions.map(p=>String(p).padStart(2,'0')).join(', ')}`.slice(0,160)]);
   kept.push({...record,signature:undefined,alerts:group.alerts,reportScope:'order',reportOperationIds:operations.filter((o:any)=>o.document?.checklistRun).map((o:any)=>String(o.id))});
  }
 }
 // Coverage belongs to the OS receipt. Completed operations remain immutable.
 const receipt={scheduleId:String(schedule.id),signature:orderReviewSignature(operations),by:email,at:new Date().toISOString(),checklistAlertTasks:kept};
 await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('service_order_reviewed',$1,$1,$2)",[email,JSON.stringify(receipt)]);
 return {orderReview:receipt};
}
