import 'server-only';
import type {PoolClient} from 'pg';
import {createTask} from '../tasks/store';
import {checklistAlerts,existingAlertTask,checklistAlertSignature,validateAlertTask} from './checklist-alerts';
import {renderChecklistPdf} from './checklist-pdf';
import {technicalReport} from './technical-report';
import {reportFilenameMode} from './checklist-report';
import {operationNumber} from './operation-number';

/** Runs inside the locked operation review transaction: task, PDF and review commit together. */
export async function createChecklistAlertTask(c:PoolClient,operation:any,schedule:any,document:any,settings:any,email:string,input:any){
 const alerts=checklistAlerts(document.checklistRun);
 if(!alerts.length)return document;
 const previous=existingAlertTask(document,alerts);
 if(previous){
  const found=await c.query('SELECT id FROM web_tasks WHERE id=$1',[previous.taskId]);
  if(found.rows.length)return document;
 }
 const taskInput=validateAlertTask(input);
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
 const result=await createTask({title:`Alertas da OS ${number} · Operação ${position}`.slice(0,160),description:taskInput.description,assignedTo:taskInput.assignedTo,priority:'high',dueDate:'',orderCompany:String(schedule.company_id),orderId:String(schedule.order_id)}, {id:email,email,user_metadata:{display_name:actor?.display_name||email}},c);
 const taskId=String(result.task.id);
 await c.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Alertas identificados no checklist',$2,true,$3,$4)",[taskId,alerts.map(a=>`${a.stage} · ${a.label}: ${a.value}`).join('\n'),email,actor?.display_name||email]);
 await c.query('INSERT INTO web_task_attachments(task_id,filename,content_type,content,created_by,created_name) VALUES($1,$2,$3,$4,$5,$6)',[taskId,filename,'application/pdf',Buffer.from(bytes),email,actor?.display_name||email]);
 return {...document,checklistAlertTasks:[...(document.checklistAlertTasks||[]).filter((t:any)=>t.signature!==checklistAlertSignature(alerts)),{taskId,signature:checklistAlertSignature(alerts),alerts,reportMode:taskInput.reportMode,at:new Date().toISOString(),by:email}]};
}
