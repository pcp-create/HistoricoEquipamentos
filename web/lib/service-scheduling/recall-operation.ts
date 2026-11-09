import {planningStatus} from './model';
import {reportSubmission} from './checklists';
/** Called inside the scheduling transaction, after locking and checking the operation version. */
export async function recallOperation(c:any,operation:any,actor:string,input:any){
 if(!operation.sent_at)throw Error('Esta operação ainda não foi enviada ao técnico.');
 if(!['scheduled','awaiting_execution','executing','planning','pending'].includes(operation.status)||reportSubmission(operation.document.checklistRun)||operation.document.checklistRun?.partialSubmission)
  throw Error('A operação já foi enviada para revisão. Devolva o relatório antes de retornar a programação.');
 if(input.confirmReturn!==true)throw Error('Confirme o retorno da OS ao planejamento.');
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(!reason||reason.length>2000)throw Error('Informe o motivo do retorno (até 2.000 caracteres).');
 if((await c.query("SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND state<>'finished'",[operation.id])).rows.length)
  throw Error('Finalize os apontamentos ativos antes de retornar a OS ao planejamento.');
 const document={...operation.document,equipmentLocked:false,checklistReturn:{at:new Date().toISOString(),by:actor,reason,checklistId:operation.document.checklistId||''}};
 const result=(await c.query('UPDATE web_service_operations SET document=$2,status=$3,sent_at=NULL,version=version+1,updated_at=now(),updated_by=$4 WHERE id=$1 RETURNING *',[operation.id,JSON.stringify(document),planningStatus(document),actor])).rows[0];
 await c.query("UPDATE web_tasks t SET assigned_to=COALESCE(NULLIF(w.planner,''),$2),source_status='planning',status='in_progress',kanban_column=NULL,stage_id=NULL,completed_at=NULL,version=t.version+1,updated_at=now(),updated_by=$2 FROM web_service_operation_workflows w WHERE t.id=w.task_id AND w.operation_id=$1",[operation.id,actor]);
 await c.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) SELECT task_id,'OS retornada ao planejamento',$3,true,$2,COALESCE((SELECT display_name FROM web_user_access WHERE email=$2),$2) FROM web_service_operation_workflows WHERE operation_id=$1",[operation.id,actor,reason]);
 await c.query("INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,'recall',$2,$3)",[operation.id,actor,reason]);
 await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('service_operation_recalled',$1,$1,$2)",[actor,JSON.stringify({operationId:operation.id,reason,before:operation,after:result})]);
 return result;
}
