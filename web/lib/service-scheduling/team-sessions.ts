import "server-only";
import {randomUUID} from "node:crypto";
import {database} from "../db";
import {Forbidden} from "../auth";
export class TeamSessionError extends Error {}
export async function teamSessionsAvailable(c:any) {
 return !!(await c.query("SELECT to_regclass('public.web_field_session_links') IS NOT NULL AS available")).rows[0]?.available;
}
export async function teamController(c:any,sessionId:string) {
 if(!await teamSessionsAvailable(c))return null;
 return (await c.query("SELECT controller FROM web_field_session_links WHERE target_session_id=$1 AND mode='live'",[sessionId])).rows[0]?.controller || null;
}
async function selectedMembers(c:any,operation:any,actor:string,selected:any) {
 if(!Array.isArray(selected)||!selected.length||selected.length>50||selected.some(v=>typeof v!=="string")||new Set(selected).size!==selected.length)
  throw new TeamSessionError("Selecione os integrantes da equipe de apoio.");
 const support=operation.document.support || [];
 if(selected.some(email=>email===actor || !support.includes(email)))throw new Forbidden();
 const users=(await c.query("SELECT email FROM web_user_access WHERE email=ANY($1::text[]) AND enabled",[selected])).rows;
 if(users.length!==selected.length)throw new TeamSessionError("Selecione apenas integrantes ativos da equipe de apoio.");
 return selected as string[];
}
async function noOverlap(c:any,actor:string,start:any,end:any) {
 const conflict=(await c.query(`SELECT 1 FROM web_field_sessions f WHERE f.actor=$1
 AND COALESCE((f.correction->>'started_at')::timestamptz,f.started_at)<COALESCE($3::timestamptz,'infinity'::timestamptz)
 AND COALESCE((f.correction->>'finished_at')::timestamptz,f.finished_at,'infinity'::timestamptz)>$2::timestamptz LIMIT 1`,[actor,start,end])).rows.length;
 if(conflict)throw new TeamSessionError("Um integrante selecionado já possui apontamento neste período ou uma atividade em andamento.");
}
async function copySession(c:any,source:any,actor:string,controller:string,mode:"live"|"copy") {
 const effective={...source,...source.correction};
 await noOverlap(c,actor,effective.started_at,mode==="live"?null:effective.finished_at);
 const id=randomUUID();
 await c.query(`INSERT INTO web_field_sessions(id,operation_id,actor,kind,state,started_at,segment_at,finished_at,active_seconds,pause_seconds,pause_reason,pause_alert_at,vehicle_id,odometer_start,odometer_end,correction)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
 [id,source.operation_id,actor,source.kind,source.state,source.started_at,source.segment_at,source.finished_at,source.active_seconds,source.pause_seconds,source.pause_reason,source.pause_alert_at,source.vehicle_id,source.odometer_start,source.odometer_end,source.correction?JSON.stringify(source.correction):null]);
 await c.query("INSERT INTO web_field_session_links(source_session_id,target_session_id,actor,controller,mode) VALUES($1,$2,$3,$4,$5)",[source.id,id,actor,controller,mode]);
 return id;
}
export async function beginTeam(c:any,operation:any,sourceId:string,actor:string,members:any) {
 if(!await teamSessionsAvailable(c))throw new TeamSessionError("Atualize a estrutura de apontamentos em equipe.");
 const selected=await selectedMembers(c,operation,actor,members);
 const source=(await c.query("SELECT * FROM web_field_sessions WHERE id=$1",[sourceId])).rows[0];
 for(const member of selected)await copySession(c,source,member,actor,"live");
}
async function writeEvent(c:any,source:any,target:any,action:string,details:any,location:any,at:any,controller:string) {
 await c.query(`INSERT INTO web_field_events(request_id,operation_id,actor,action,latitude,longitude,accuracy,located_at,document,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
 [randomUUID(),source.operation_id,target.actor,action,location.latitude,location.longitude,location.accuracy,location.at || location.located_at,
 JSON.stringify({...details,sessionId:target.id,replicatedBy:controller,sourceSessionId:source.id,locationSource:"controller"}),at]);
}
async function costEvent(c:any,source:any,target:any,controller:string) {
 const effective={...source,...source.correction};
 await c.query("INSERT INTO web_service_operation_events(operation_id,action,hours,actor,description,created_at) VALUES($1,$2,$3,$4,$5,$6)",
 [source.operation_id,source.kind==="work"?"work_log":"travel_log",Number(effective.active_seconds)/3600,target.actor,"Apontamento replicado por "+controller,source.finished_at]);
}
export async function syncTeam(c:any,sourceId:string,action:string,details:any,location:any,at:any,actor:string) {
 if(!await teamSessionsAvailable(c))return;
 const links=(await c.query("SELECT target_session_id AS id,actor FROM web_field_session_links WHERE source_session_id=$1 AND mode='live'",[sourceId])).rows;
 if(!links.length)return;
 const source=(await c.query("SELECT * FROM web_field_sessions WHERE id=$1",[sourceId])).rows[0];
 for(const target of links){
  await c.query(`UPDATE web_field_sessions SET state=$2,segment_at=$3,finished_at=$4,active_seconds=$5,pause_seconds=$6,pause_reason=$7,pause_alert_at=$8,odometer_end=$9 WHERE id=$1`,
   [target.id,source.state,source.segment_at,source.finished_at,source.active_seconds,source.pause_seconds,source.pause_reason,source.pause_alert_at,source.odometer_end]);
  await writeEvent(c,source,target,action,details,location,at,actor);
  if(action==="stop")await costEvent(c,source,target,actor);
 }
}
export async function replicateTimeLog(body:any,email:string) {
 const c=await database().connect();
 try {
  await c.query("BEGIN READ WRITE");
  await c.query("SELECT pg_advisory_xact_lock(728001)");
  if(!(await c.query("SELECT 1 FROM web_user_access WHERE email=$1 AND enabled",[email])).rows.length)throw new Forbidden();
  if(typeof body?.sessionId!=="string" || !/^[0-9a-f-]{36}$/i.test(body.sessionId))throw new TeamSessionError("Selecione um apontamento com início e fim registrados.");
  if(!await teamSessionsAvailable(c))throw new TeamSessionError("Atualize a estrutura de apontamentos em equipe.");
  const source=(await c.query("SELECT * FROM web_field_sessions WHERE id=$1 AND actor=$2 FOR UPDATE",[body.sessionId,email])).rows[0];
  if(!source)throw new Forbidden();
  if(source.state!=="finished")throw new TeamSessionError("Finalize o apontamento antes de replicar.");
  const operation=(await c.query("SELECT * FROM web_service_operations WHERE id=$1 FOR UPDATE",[source.operation_id])).rows[0];
  if(operation.document.responsible!==email && !operation.document.support?.includes(email))throw new Forbidden();
  if((await c.query("SELECT 1 FROM web_field_time_requests WHERE session_id=$1 AND status='pending'",[source.id])).rows.length)throw new TeamSessionError("Aguarde a aprovação do ajuste antes de replicar.");
  const members=await selectedMembers(c,operation,email,body.members);
  const events=(await c.query("SELECT * FROM web_field_events WHERE document->>'sessionId'=$1 ORDER BY created_at,id",[source.id])).rows;
  let copied=0;
  for(const member of members){
   if((await c.query("SELECT 1 FROM web_field_session_links WHERE source_session_id=$1 AND actor=$2",[source.id,member])).rows.length)continue;
   const id=await copySession(c,source,member,email,"copy");
   for(const event of events)await writeEvent(c,source,{id,actor:member},event.action,event.document,event,event.created_at,email);
   await costEvent(c,source,{id,actor:member},email);
   copied++;
  }
  await c.query("INSERT INTO web_access_events(email,event,details) VALUES($1,'field_time_replicated',$2)",[email,JSON.stringify({sourceSessionId:source.id,members,copied})]);
  await c.query("COMMIT");return {saved:true,copied};
 }catch(error){await c.query("ROLLBACK");throw error;}finally{c.release();}
}
