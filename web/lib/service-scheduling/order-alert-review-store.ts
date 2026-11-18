import 'server-only';
import {createAlertGroup} from './checklist-alert-task';
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
 const groups=validateAlertTaskGroups(pending,input.alertTasks);
 // Older installations may have prepared tasks with preliminary attachments.
 for(const task of kept)for(const o of operations){
  const alerts=(task.alerts||[]).filter((a:ChecklistAlert)=>a.operationId===String(o.id)).map(({operationId,operationPosition,...a}:ChecklistAlert)=>a);
  if(!alerts.length)continue;
  const preview=await c.query("SELECT 1 FROM web_task_attachments WHERE task_id=$1 AND (filename LIKE $2 OR filename LIKE 'OS %-Previo.pdf') LIMIT 1",[task.taskId,`Relatorio-OS-%-Operacao-${String(o.position).padStart(2,'0')}-%-Previo.pdf`]);
  if(preview.rows.length)await createAlertGroup(c,o,schedule,o.document,settings,email,alerts,task,String(task.taskId));
 }
 const order=(await c.query('SELECT numero_sequencia FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2',[schedule.company_id,schedule.order_id])).rows[0];
 for(const group of groups){
  if(!group.alerts.length)throw Error('Selecione ao menos um alerta para cada tarefa da OS.');
  let taskId:string|undefined,record:any;
  const positions:number[]=[];
  for(const o of operations){
   const alerts=group.alerts.filter((a:ChecklistAlert)=>a.operationId===String(o.id)).map(({operationId,operationPosition,...a}:ChecklistAlert)=>a);
   if(!alerts.length)continue;
   const document=await createAlertGroup(c,o,schedule,o.document,settings,email,alerts,group,taskId);
   record=document.checklistAlertTasks.at(-1);
   taskId=String(record.taskId);positions.push(o.position);
  }
  if(taskId){
   await c.query('UPDATE web_tasks SET title=$2 WHERE id=$1',[taskId,`Alertas da OS ${order?.numero_sequencia||schedule.order_id} · Operações ${positions.map(p=>String(p).padStart(2,'0')).join(', ')}`.slice(0,160)]);
   kept.push({...record,signature:undefined,alerts:group.alerts});
  }
 }
 // Coverage belongs to the OS receipt. Completed operations remain immutable.
 const receipt={scheduleId:String(schedule.id),signature:orderReviewSignature(operations),by:email,at:new Date().toISOString(),checklistAlertTasks:kept};
 await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('service_order_reviewed',$1,$1,$2)",[email,JSON.stringify(receipt)]);
 return {orderReview:receipt};
}
