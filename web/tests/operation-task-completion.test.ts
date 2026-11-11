import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
import {manuallyCompletableTask} from '../lib/tasks/completion-policy';
test('operation tasks complete only at review, repair once, and never reopen during later flow routing',async()=>{
 const db=new PGlite();const one='10000000-0000-4000-8000-000000000001',two='20000000-0000-4000-8000-000000000002';
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE web_user_access(email text,display_name text);
 CREATE TABLE web_service_schedules(id bigint,company_id bigint,order_id bigint,active boolean);
 CREATE TABLE web_service_operations(id uuid PRIMARY KEY,schedule_id bigint,status text,updated_by text);
 CREATE TABLE web_service_operation_workflows(operation_id uuid,task_id bigint);
 CREATE TABLE web_tasks(id bigint PRIMARY KEY,source_key text,status text,source_resolved boolean DEFAULT false,completed_at timestamptz,kanban_column text,updated_at timestamptz,updated_by text,version int DEFAULT 1);
 CREATE TABLE web_task_notes(task_id bigint,title text,description text,automatic boolean,created_by text,created_name text);
 CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);
 INSERT INTO web_service_schedules VALUES(1,1,100,true);
 INSERT INTO web_service_operations VALUES('${one}',1,'reviewed','planner'),('${two}',1,'awaiting_review','planner');
 INSERT INTO web_tasks(id,source_key,status) VALUES(1,'manual:schedule-operation:${one}','in_progress'),(2,'manual:schedule-operation:${two}','in_progress'),(3,'manual:normal','in_progress');
 INSERT INTO web_service_operation_workflows VALUES('${one}',1),('${two}',2);`);
 await db.exec(readFileSync('sql/106_operation_task_completion.sql','utf8'));
 assert.equal((await db.query<any>("SELECT complete_reviewed_operation_tasks('Sistema') n")).rows[0].n,1);
 assert.equal((await db.query<any>("SELECT complete_reviewed_operation_tasks('Sistema') n")).rows[0].n,0);
 assert.equal((await db.query<any>('SELECT count(*)::int n FROM web_task_notes')).rows[0].n,1);
 await assert.rejects(db.exec("UPDATE web_tasks SET status='completed' WHERE id=2"),/automaticamente/);
 await db.exec(`UPDATE web_service_operations SET status='reviewed' WHERE id='${two}'`);
 assert.equal((await db.query<any>('SELECT count(*)::int n FROM web_tasks WHERE status=\'completed\'')).rows[0].n,2);
 const completedAt=(await db.query<any>('SELECT completed_at FROM web_tasks WHERE id=1')).rows[0].completed_at;
 await db.exec("UPDATE web_tasks SET status='in_progress',completed_at=NULL WHERE id=1;SELECT route_schedule_flow_tasks(1,100,'Sistema');");
 assert.equal((await db.query<any>('SELECT status FROM web_tasks WHERE id=1')).rows[0].status,'completed');
 assert.deepEqual((await db.query<any>('SELECT completed_at FROM web_tasks WHERE id=1')).rows[0].completed_at,completedAt);
 assert.equal((await db.query<any>('SELECT status FROM web_tasks WHERE id=3')).rows[0].status,'in_progress');
 assert.equal(manuallyCompletableTask({source_key:'manual:normal'}),true);
 assert.equal(manuallyCompletableTask({source_key:'manual:schedule-operation:'+one}),false);
 }finally{await db.close();}
});
