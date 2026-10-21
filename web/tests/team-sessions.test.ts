import {test} from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {fieldAction} from "../lib/service-scheduling/field-store";
import {replicateTimeLog,teamController} from "../lib/service-scheduling/team-sessions";
import {timeLogs} from "../lib/service-scheduling/time-logs";
test("joint sessions mirror timers atomically, prevent member control and replicate finished logs without duplicates",async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query:any=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
  for(const name of ["008_administration","009_employees","028_service_scheduling","030_service_schedule_visibility","037_field_operations","038_time_adjustment_requests","058_field_session_teams"])
   await db.exec(readFileSync(new URL("../sql/"+name+".sql",import.meta.url),"utf8"));
  await db.exec("INSERT INTO web_user_access(email,display_name,role,updated_by) VALUES('tech','Técnico','user','test'),('helper','Apoio','user','test'),('second','Segundo','user','test'),('outsider','Outro','user','test'); UPDATE web_service_schedule_settings SET document=document||'{\"pauseReasons\":[{\"id\":\"rest\",\"name\":\"Pausa\",\"minutes\":15}]}'::jsonb;");
  const schedule=(await query("INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'test') RETURNING id")).rows[0].id;
  const id=randomUUID();
  await query("INSERT INTO web_service_operations(id,schedule_id,position,status,sent_at,document,updated_by) VALUES($1,$2,1,'awaiting_execution',now(),$3,'test')",[id,schedule,JSON.stringify({responsible:"tech",support:["helper","second"],internalNote:""})]);
  const act=(action:string,extra:any={},email="tech")=>fieldAction({action,operationId:id,requestId:randomUUID(),location:{latitude:-27,longitude:-49,accuracy:5,at:new Date().toISOString()},...extra},email);
  for(const actor of ["tech","helper"]){
   await act("info_read",{},actor);
   await query("INSERT INTO web_field_material_checks(operation_id,actor) VALUES($1,$2)",[id,actor]);
  }
  await assert.rejects(act("start_work",{teamMembers:["outsider"]}));
  assert.equal((await query("SELECT * FROM web_field_sessions")).rows.length,0);
  const requestId=randomUUID();
  await act("start_work",{teamMembers:["helper"],requestId});
  await act("start_work",{teamMembers:["helper"],requestId});
  let sessions=(await query("SELECT * FROM web_field_sessions ORDER BY actor")).rows;
  assert.equal(sessions.length,2);
  const source=sessions.find((s:any)=>s.actor==="tech"),target=sessions.find((s:any)=>s.actor==="helper");
  assert.equal(String(source.started_at),String(target.started_at));
  assert.equal(await teamController(db,target.id),"tech");
  await assert.rejects(act("stop",{sessionId:target.id},"helper"),/controlado/);
  await query("UPDATE web_field_sessions SET segment_at=now()-interval '10 minutes',started_at=now()-interval '10 minutes'");
  await act("pause",{sessionId:source.id,reasonId:"rest"});
  sessions=(await query("SELECT * FROM web_field_sessions")).rows;
  assert.ok(sessions.every((s:any)=>s.state==="paused"));
  assert.equal(sessions[0].active_seconds,sessions[1].active_seconds);
  await query("UPDATE web_field_sessions SET segment_at=now()-interval '2 minutes'");
  await act("resume",{sessionId:source.id});
  await act("stop",{sessionId:source.id});
  sessions=(await query("SELECT * FROM web_field_sessions")).rows;
  assert.ok(sessions.every((s:any)=>s.state==="finished"));
  assert.equal(sessions[0].pause_seconds,sessions[1].pause_seconds);
  const events=(await query("SELECT * FROM web_field_events")).rows;
  const sourceEvents=events.filter((e:any)=>e.actor==="tech"&&e.document.sessionId===source.id);
  const targetEvents=events.filter((e:any)=>e.actor==="helper"&&e.document.sessionId===target.id);
  assert.deepEqual(sourceEvents.map((e:any)=>e.action),targetEvents.map((e:any)=>e.action));
  assert.ok(targetEvents.every((e:any)=>e.document.replicatedBy==="tech"));
  // Approved corrections are copied as effective values without duplicating the mirrored cost event.
  const finished=(await query("SELECT * FROM web_field_sessions WHERE id=$1",[source.id])).rows[0];
  const correction={started_at:new Date(finished.started_at).toISOString(),finished_at:new Date(new Date(finished.finished_at).getTime()+60000).toISOString(),active_seconds:900,pause_seconds:120,pauses:[]};
  await query("UPDATE web_field_sessions SET correction=$2 WHERE id=$1",[source.id,JSON.stringify(correction)]);
  await assert.rejects(replicateTimeLog({sessionId:source.id,members:["second"]},"outsider"));
  assert.equal((await replicateTimeLog({sessionId:source.id,members:["second","helper"]},"tech")).copied,1);
  assert.equal((await replicateTimeLog({sessionId:source.id,members:["second","helper"]},"tech")).copied,0);
  const all=(await query("SELECT * FROM web_field_sessions")).rows;
  assert.equal(all.length,3);
  const logs=timeLogs(all,(await query("SELECT * FROM web_field_events")).rows,(await query("SELECT * FROM web_service_operation_events")).rows);
  assert.equal(logs.rows.length,3);
  assert.equal(logs.summary.people,3);
  assert.equal(logs.rows.find((row:any)=>row.actor==="second")?.active,900);
  // An overlapping target prevents the entire request, including previously valid selections.
  const conflictId=randomUUID();
  await query("DELETE FROM web_field_session_links WHERE actor='second'");
  await query("INSERT INTO web_field_sessions(id,operation_id,actor,kind,state,started_at,segment_at) VALUES($1,$2,'second','work','running',now()-interval '1 hour',now())",[conflictId,id]);
  await assert.rejects(replicateTimeLog({sessionId:source.id,members:["second"]},"tech"),/período/);
 }finally{g.historyPool=old;await db.close();}
});
