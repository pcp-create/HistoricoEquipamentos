import 'server-only';
import {database} from '../db';
import {OrderInputError} from './model';

/** Read existing records, including operation snapshots retained after deletion. */
export async function orderActivity(company:string,order:string,page=0){
 if(!['1','2','27404'].includes(company)||!/^[1-9]\d{0,17}$/.test(order)||!Number.isSafeInteger(page)||page<0||page>100000)throw new OrderInputError('OS ou página inválida.');
 const result=await database().query(`WITH schedules AS (
 SELECT id::text FROM web_service_schedules WHERE company_id=$1::int AND order_id=$2::bigint
 UNION SELECT details->'schedule'->>'id' FROM web_access_events WHERE details->'schedule'->>'company_id'=$1::text AND details->'schedule'->>'order_id'=$2::text
 ), operations AS (
 SELECT id::text,position,schedule_id::text FROM web_service_operations WHERE schedule_id::text IN(SELECT id FROM schedules)
 UNION SELECT details->'operation'->>'id',(details->'operation'->>'position')::int,details->'operation'->>'schedule_id' FROM web_access_events WHERE event='service_operation_removed' AND details->'operation'->>'schedule_id' IN(SELECT id FROM schedules)
 ), activity AS (
 SELECT 'audit:'||a.id id,a.created_at at,COALESCE(a.actor,a.email) actor,a.event action,
 COALESCE(a.details->>'operation_id',a.details->>'operationId',a.details->'operation'->>'id',CASE WHEN jsonb_typeof(a.details->'operation')='string' THEN a.details->>'operation' END,CASE WHEN a.event LIKE 'service_operation_%' THEN a.details->>'id' END) operation_id,a.details
 FROM web_access_events a WHERE
 (COALESCE(a.details->>'company',a.details->>'company_id')=$1::text AND COALESCE(a.details->>'order',a.details->>'orderId',a.details->>'order_id')=$2::text)
 OR a.details->>'scheduleId' IN(SELECT id FROM schedules) OR a.details->>'schedule_id' IN(SELECT id FROM schedules)
 OR a.details->'schedule'->>'id' IN(SELECT id FROM schedules)
 OR a.details->'before'->>'schedule_id' IN(SELECT id FROM schedules) OR a.details->'after'->>'schedule_id' IN(SELECT id FROM schedules)
 OR a.details->'operation'->>'schedule_id' IN(SELECT id FROM schedules)
 OR COALESCE(a.details->>'operation_id',a.details->>'operationId',CASE WHEN jsonb_typeof(a.details->'operation')='string' THEN a.details->>'operation' END,CASE WHEN a.event LIKE 'service_operation_%' THEN a.details->>'id' END) IN(SELECT id FROM operations)
 UNION ALL SELECT 'field:'||e.id,e.created_at,e.actor,'field_'||e.action,e.operation_id::text,e.document FROM web_field_events e WHERE e.operation_id::text IN(SELECT id FROM operations)
 UNION ALL SELECT 'operation:'||e.id,e.created_at,e.actor,'operation_'||e.action,e.operation_id::text,jsonb_build_object('description',e.description,'hours',e.hours) FROM web_service_operation_events e WHERE e.operation_id::text IN(SELECT id FROM operations)
 UNION ALL SELECT 'task-note:'||n.id,n.created_at,n.created_by,'task_note',NULL,jsonb_build_object('taskId',t.id,'taskTitle',t.title,'title',n.title,'description',n.description,'created_name',n.created_name) FROM web_task_notes n JOIN web_tasks t ON t.id=n.task_id WHERE t.order_company=$1::int AND t.order_id=$2::bigint AND t.title !~* '(apontamento|horas)' AND n.title !~* '(apontamento|horas)' AND n.description !~* '(work_log|travel_log|start_work|start_travel)'
 UNION ALL SELECT 'creation:'||s.id,s.created_at,s.created_by,'order_creation_requested',NULL,jsonb_build_object('request',s.request) FROM service_order_submissions s WHERE s.company_id=$1::int AND s.m8_id=$2::bigint
 UNION ALL SELECT 'creation-result:'||s.id,s.updated_at,s.created_by,'order_creation_result',NULL,jsonb_build_object('state',s.state,'message',s.message,'nextItem',s.next_item) FROM service_order_submissions s WHERE s.company_id=$1::int AND s.m8_id=$2::bigint
 UNION ALL SELECT 'edit:'||e.id,e.created_at,e.created_by,'order_edit_requested',NULL,jsonb_build_object('request',e.request,'changes',e.steps->0->'orderChange') FROM service_order_edits e WHERE e.company_id=$1::int AND e.m8_id=$2::bigint
 UNION ALL SELECT 'edit-result:'||e.id,e.updated_at,e.created_by,'order_edit_result',NULL,jsonb_build_object('state',e.state,'message',e.message,'nextStep',e.next_step) FROM service_order_edits e WHERE e.company_id=$1::int AND e.m8_id=$2::bigint
 ) SELECT a.*,COALESCE(NULLIF(a.details->>'authorName',''),NULLIF(u.display_name,''),NULLIF(a.details->>'created_name',''),a.actor,'Sistema') author,(SELECT position FROM operations o WHERE o.id=a.operation_id LIMIT 1) position
 FROM activity a LEFT JOIN web_user_access u ON u.email=a.actor WHERE a.action !~ '(^|_)(start_work|start_travel|stop|pause|resume|work_log|travel_log|time|clock)(_|$)' AND a.action !~ '(^|_)checklist_save$' AND a.action<>'returned_operation_records_archived' ORDER BY a.at DESC,a.id DESC LIMIT 51 OFFSET $3`,[company,order,page*50]);
 return {rows:result.rows.slice(0,50),hasMore:result.rows.length>50};
}
