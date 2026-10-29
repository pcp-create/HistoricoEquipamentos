import {validateRunAlertComments} from './checklists';
import 'server-only';
import type {PoolClient} from 'pg';
import {createTask} from '../tasks/store';
import {checklistAlerts,checklistAlertSignature,validateAlertTask,pendingChecklistAlerts,validateAlertTaskGroups} from './checklist-alerts';
import {renderChecklistPdf} from './checklist-pdf';
import {technicalReport} from './technical-report';
import {reportFilenameMode} from './checklist-report';
import {operationNumber} from './operation-number';

/** Runs inside the locked operation review transaction: task, PDF and review commit together. */
export async function createChecklistAlertTask(c:PoolClient,operation:any,schedule:any,document:any,settings:any,email:string,input:any){
 validateRunAlertComments(document.checklistRun);
 const allAlerts=checklistAlerts(document.checklistRun);
 if(!allAlerts.length)return document;
 const records=document.checklistAlertTasks||[];
 const ids=records.map((t:any)=>t.taskId);
 const live=ids.length?(await c.query('SELECT id::text FROM web_tasks WHERE id=ANY($1::bigint[])',[ids])).rows.map(r=>String(r.id)):[];
 document={...document,checklistAlertTasks:records.filter((t:any)=>live.includes(String(t.taskId)))};
 // Finalize attachments of tasks created through the earlier pre-review flow.
 for(const record of document.checklistAlertTasks){
  const preview=await c.query("SELECT 1 FROM web_task_attachments WHERE task_id=$1 AND filename LIKE $2 LIMIT 1",[record.taskId,`Relatorio-OS-%-Operacao-${operationNumber(operation.position)}-%-Previo.pdf`]);
  if(preview.rows.length)document=await createAlertGroup(c,operation,schedule,document,settings,email,record.alerts,validateAlertTask(record),String(record.taskId));
 }
 const pending=pendingChecklistAlerts(document,allAlerts);
 const groups=validateAlertTaskGroups(pending,input);
 for(const group of groups)document=await createAlertGroup(c,operation,schedule,document,settings,email,group.alerts,group);
 return document;
}
async function createAlertGroup(c:PoolClient,operation:any,schedule:any,document:any,settings:any,email:string,alerts:any[],taskInput:ReturnType<typeof validateAlertTask>,existingTaskId?:string){
 const order=(await c.query('SELECT * FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2',[schedule.company_id,schedule.order_id])).rows[0];
 if(!order)throw Error('OS não encontrada para anexar o relatório à tarefa.');
 const users=(await c.query('SELECT email,display_name FROM web_user_access')).rows;
 const actor=users.find(u=>u.email===email);
 const sessions=(await c.query('SELECT f.*,u.display_name FROM web_field_sessions f LEFT JOIN web_user_access u ON u.email=f.actor WHERE f.operation_id=$1',[operation.id])).rows;
 const events=(await c.query("SELECT * FROM web_field_events WHERE operation_id=$1 AND action IN ('start_work','start_travel','pause','resume','stop') ORDER BY created_at,id",[operation.id])).rows;
 const history=(await c.query('SELECT e.*,u.display_name FROM web_service_operation_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE e.operation_id=$1',[operation.id])).rows;
 const report=technicalReport({...operation,document},order,users,sessions,events,history,taskInput.reportMode,settings.pauseReasons||[]);
 const photoIds=[...new Set(report.flatMap(s=>s.groups.flatMap(g=>g.fields.flatMap(f=>f.photos))))];
 const photos=photoIds.length?(await c.query('SELECT id::text,content FROM web_service_checklist_photos WHERE operation_id=$1 AND id=ANY($2::bigint[])',[operation.id,photoIds])).rows:[];
 if(photos.length!==photoIds.length)throw Error('Há fotos indisponíveis no relatório. Confira os anexos antes de concluir a revisão.');
 const number=String(order.numero_sequencia||schedule.order_id),position=operationNumber(operation.position);
 const bytes=await renderChecklistPdf({title:document.checklistRun.template.name,order:number,position:operation.position,client:order.cliente_nome||'',equipment:'',report,photos,mode:taskInput.reportMode});
 const filename=`Relatorio-OS-${number.replace(/[^\w-]/g,'')}-Operacao-${position}-${reportFilenameMode[taskInput.reportMode]}.pdf`;
 const result=existingTaskId?{task:{id:existingTaskId}}:await createTask({title:`Alertas da OS ${number} · Operação ${position}`.slice(0,160),description:taskInput.description,assignedTo:taskInput.assignedTo,priority:'high',dueDate:'',orderCompany:String(schedule.company_id),orderId:String(schedule.order_id)}, {id:email,email,user_metadata:{display_name:actor?.display_name||email}},c);
 const taskId=String(result.task.id);
 await c.query("UPDATE web_tasks SET origin='Revisão de relatório' WHERE id=$1",[taskId]);
 if(existingTaskId)await c.query("DELETE FROM web_task_attachments WHERE task_id=$1 AND filename LIKE $2",[taskId,`Relatorio-OS-%-Operacao-${position}-%-Previo.pdf`]);
 await c.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Alertas identificados no checklist',$2,true,$3,$4)",[taskId,alerts.map(a=>`${a.stage} · ${a.label}: ${a.value}\nComentário: ${a.comment||"Não informado"}`).join('\n'),email,actor?.display_name||email]);
 await c.query('INSERT INTO web_task_attachments(task_id,filename,content_type,content,created_by,created_name) VALUES($1,$2,$3,$4,$5,$6)',[taskId,filename,'application/pdf',Buffer.from(bytes),email,actor?.display_name||email]);
 return {...document,checklistAlertTasks:[...(document.checklistAlertTasks||[]).filter((t:any)=>t.signature!==checklistAlertSignature(alerts)),{taskId,signature:checklistAlertSignature(alerts),alerts,assignedTo:taskInput.assignedTo,description:taskInput.description,reportMode:taskInput.reportMode,at:new Date().toISOString(),by:email}]};
}
