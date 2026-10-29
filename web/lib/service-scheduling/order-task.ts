import 'server-only';
import {repairOrderReportTasks} from '../tasks/order-task-repair';
import {database} from '../db';
import {Forbidden} from '../auth';
import {createTask,TaskInputError} from '../tasks/store';
import {validateAlertTask} from './checklist-alerts';
import {orderReportPdf} from './order-report-store';
export async function createOrderTask(body:any,email:string){
 if(!/^\d{1,18}$/.test(body?.scheduleId||'')||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body?.requestId||''))throw new TaskInputError('Solicitação inválida.');
 let input;try{input=validateAlertTask(body);}catch(e){throw new TaskInputError((e as Error).message);}
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');
  await c.query('SELECT pg_advisory_xact_lock(728001)');
  const user=(await c.query('SELECT enabled,display_name FROM web_user_access WHERE email=$1',[email])).rows[0];
  if(!user?.enabled)throw new Forbidden();
  const schedule=(await c.query('SELECT * FROM web_service_schedules WHERE id=$1',[body.scheduleId])).rows[0];
  if(!schedule)throw new TaskInputError('Programação não encontrada.');
  await repairOrderReportTasks(c);
  const source=`manual:order-report-task:${schedule.id}:${email}:${body.requestId}`;
  const existing=(await c.query('SELECT id::text FROM web_tasks WHERE source_key=$1',[source])).rows[0];
  if(existing){await c.query('COMMIT');return {taskId:existing.id};}
  const operations=(await c.query("SELECT * FROM web_service_operations WHERE schedule_id=$1 AND status<>'cancelled' ORDER BY position,id FOR UPDATE",[schedule.id])).rows.filter(o=>o.document.checklistId||o.document.checklistRun);
  if(!operations.length)throw new TaskInputError('A OS não possui relatório técnico para anexar.');
  if(operations.some(o=>!['reviewed','completed'].includes(o.status)||!o.document.checklistRun))throw new TaskInputError('Conclua a revisão das operações com relatório antes de gerar a tarefa da OS. O anexo deve ser o relatório final.');
  const pdf=await orderReportPdf({scheduleId:String(schedule.id),operationIds:operations.map(o=>o.id),mode:input.reportMode},email,false,c);
  const order=(await c.query('SELECT numero_sequencia FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2',[schedule.company_id,schedule.order_id])).rows[0];
  const result=await createTask({title:`Tarefa da OS ${order?.numero_sequencia||schedule.order_id}`,description:input.description,assignedTo:input.assignedTo,priority:'normal',dueDate:'',orderCompany:String(schedule.company_id),orderId:String(schedule.order_id)}, {id:email,email,user_metadata:{display_name:user.display_name||email}},c);
  const taskId=String(result.task.id);
  await c.query("UPDATE web_tasks SET source_key=$2,origin='Revisão de relatório' WHERE id=$1",[taskId,source]);
  await c.query('INSERT INTO web_task_attachments(task_id,filename,content_type,content,created_by,created_name) VALUES($1,$2,$3,$4,$5,$6)',[taskId,pdf.filename,'application/pdf',Buffer.from(pdf.bytes),email,user.display_name||email]);
  await c.query('COMMIT');return {taskId};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
