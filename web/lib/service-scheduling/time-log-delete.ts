import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {TimeRequestError} from './time-request-store';
const uuid=(v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** Delete only a finished log; archive the original and its costing mirrors atomically. */
export async function deleteTimeLog(body:any,actor:string){
 if(!uuid(body?.requestId)||!uuid(body?.operationId)||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000)throw new TimeRequestError('Informe o apontamento e o motivo da exclusão (até 2.000 caracteres).');
 if(!((uuid(body.sessionId)&&body.legacyEventId==null)||(body.sessionId==null&&typeof body.legacyEventId==='string'&&/^[1-9]\d{0,17}$/.test(body.legacyEventId))))throw new TimeRequestError('Apontamento inválido.');
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');await c.query('SELECT pg_advisory_xact_lock(728001)');
  if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[actor])).rows.length)throw new Forbidden();
  const repeated=(await c.query("SELECT details FROM web_access_events WHERE event='planner_time_log_deleted' AND actor=$1 AND details->>'requestId'=$2",[actor,body.requestId])).rows[0];
  if(repeated){
   if(repeated.details.operationId!==body.operationId||repeated.details.sessionId!==(body.sessionId||null)||repeated.details.legacyEventId!==(body.legacyEventId||null))throw new TimeRequestError('Identificador utilizado para outra exclusão.');
   await c.query('COMMIT');return {deleted:true,alreadyDeleted:true};
  }
  const session=body.sessionId?(await c.query('SELECT * FROM web_field_sessions WHERE id=$1 AND operation_id=$2 FOR UPDATE',[body.sessionId,body.operationId])).rows[0]:null;
  if(body.sessionId&&(!session||session.state!=='finished'||!Number.isInteger(body.version)||Number(session.correction_version)!==body.version))throw new TimeRequestError('Finalize o apontamento e atualize a lista antes de excluir.');
  let events:any[]=[];
  if(session){
   events=(await c.query("SELECT * FROM web_service_operation_events WHERE (id=$1 OR (operation_id=$2 AND actor=$3 AND created_at=$4 AND action=$5)) FOR UPDATE",[session.legacy_event_id||null,session.operation_id,session.actor,session.finished_at,session.kind==='work'?'work_log':'travel_log'])).rows;
  }else{
   events=(await c.query("SELECT * FROM web_service_operation_events WHERE id=$1 AND operation_id=$2 AND action IN ('work_log','travel_log') FOR UPDATE",[body.legacyEventId,body.operationId])).rows;
   if(events.length!==1||Number(events[0].hours)!==Number(body.hours))throw new TimeRequestError('O apontamento foi alterado. Atualize a lista antes de excluir.');
   if((await c.query('SELECT 1 FROM web_field_sessions WHERE legacy_event_id=$1 OR (operation_id=$2 AND actor=$3 AND finished_at=$4)',[events[0].id,events[0].operation_id,events[0].actor,events[0].created_at])).rows.length)throw new TimeRequestError('Use o apontamento correspondente na lista atualizada.');
  }
  const eventIds=events.map(e=>String(e.id));
  if((await c.query("SELECT 1 FROM web_field_time_requests WHERE status='pending' AND (to_jsonb(web_field_time_requests)->>'applied_at') IS NULL AND (session_id=$1 OR legacy_event_id=ANY($2::bigint[]))",[session?.id||null,eventIds])).rows.length)throw new TimeRequestError('Há solicitação aguardando aprovação para este apontamento. Resolva-a antes de excluir.');
  if(session&&(await c.query('SELECT 1 FROM web_field_sessions WHERE id<>$1 AND legacy_event_id=ANY($2::bigint[])',[session.id,eventIds])).rows.length)throw new TimeRequestError('Há outro registro vinculado a este apontamento. Atualize a lista.');
  const details={requestId:body.requestId,operationId:body.operationId,sessionId:body.sessionId||null,legacyEventId:body.legacyEventId||null,reason:body.reason.trim(),session,events};
  await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('planner_time_log_deleted',$1,$1,$2)",[actor,JSON.stringify(details)]);
  await c.query("UPDATE web_field_time_requests SET original=COALESCE(original,'{}'::jsonb)||jsonb_build_object('deletedSessionId',session_id,'deletedLegacyEventId',legacy_event_id),session_id=NULL,legacy_event_id=NULL WHERE session_id=$1 OR legacy_event_id=ANY($2::bigint[])",[session?.id||null,eventIds]);
  if(session)await c.query('DELETE FROM web_field_sessions WHERE id=$1',[session.id]);
  if(eventIds.length)await c.query('DELETE FROM web_service_operation_events WHERE id=ANY($1::bigint[])',[eventIds]);
  await c.query("INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,'time_log_deleted',$2,$3)",[body.operationId,actor,'Apontamento excluído: '+body.reason.trim()]);
  await c.query('COMMIT');return {deleted:true};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
