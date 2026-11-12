import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {orderActivity} from '../lib/service-orders/activity';
test('OS activity scopes company and deleted operations, resolves authors, excludes time logs and paginates',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;g.historyPool={query:db.query.bind(db)};
 try{
  await db.exec(`CREATE TABLE web_service_schedules(id bigint,company_id int,order_id bigint);
  CREATE TABLE web_service_operations(id uuid,schedule_id bigint,position int);
  CREATE TABLE web_access_events(id bigint GENERATED ALWAYS AS IDENTITY,event text,actor text,email text,details jsonb,created_at timestamptz DEFAULT now());
  CREATE TABLE web_field_events(id bigint,operation_id uuid,action text,actor text,document jsonb,created_at timestamptz DEFAULT now());
  CREATE TABLE web_service_operation_events(id bigint,operation_id uuid,action text,actor text,description text,hours numeric,created_at timestamptz DEFAULT now());
  CREATE TABLE service_order_submissions(id uuid,company_id int,m8_id bigint,created_by text,request jsonb,state text,message text,next_item int,created_at timestamptz,updated_at timestamptz);
  CREATE TABLE service_order_edits(id uuid,company_id int,m8_id bigint,created_by text,request jsonb,steps jsonb,state text,message text,next_step int,created_at timestamptz,updated_at timestamptz);
  CREATE TABLE web_tasks(id bigint,order_company int,order_id bigint,title text);
  CREATE TABLE web_task_notes(id bigint,task_id bigint,created_by text,created_name text,title text,description text,created_at timestamptz);
  CREATE TABLE web_user_access(email text,display_name text);
  INSERT INTO web_tasks VALUES(1,1,100,'Conferir OS'),(2,1,100,'Aprovação de apontamentos');
  INSERT INTO web_task_notes VALUES(1,1,'planner','Planejador','Tarefa criada','Conferir observação',now()),(2,2,'planner','Planejador','Tarefa criada','Aprovar horas',now());
  INSERT INTO web_user_access VALUES('planner','Planejador'),('tech','Técnico');
  INSERT INTO web_service_schedules VALUES(1,1,100),(2,2,100);
  INSERT INTO web_service_operations VALUES('10000000-0000-4000-8000-000000000001',1,1),('10000000-0000-4000-8000-000000000002',2,1);
  INSERT INTO web_access_events(event,actor,email,details) VALUES
  ('service_order_comment_added','planner','planner','{"company":"1","order":"100","comment":"Aguardando cliente","authorName":"Autor original"}'),
  ('service_operation_created','planner','planner','{"operation":"10000000-0000-4000-8000-000000000001"}'),
  ('service_operation_created','planner','planner','{"operation":"10000000-0000-4000-8000-000000000002"}'),
  ('service_operation_removed','planner','planner','{"operation":{"id":"10000000-0000-4000-8000-000000000003","schedule_id":1,"position":3}}'),
  ('service_operation_created','planner','planner','{"operation":"10000000-0000-4000-8000-000000000003"}'),
  ('planner_time_log_deleted','planner','planner','{"operationId":"10000000-0000-4000-8000-000000000001"}');
  INSERT INTO web_field_events VALUES(1,'10000000-0000-4000-8000-000000000001','report_send','tech','{}',now()),(2,'10000000-0000-4000-8000-000000000001','start_work','tech','{}',now());
  INSERT INTO web_service_operation_events VALUES(1,'10000000-0000-4000-8000-000000000001','work_log','tech','Atividade',2,now());`);
  await db.exec(`INSERT INTO web_access_events(event,actor,email,details)
    SELECT 'service_operation_checklist_save','tech','tech','{"operation":"10000000-0000-4000-8000-000000000001"}'::jsonb FROM generate_series(1,60);
    INSERT INTO web_field_events VALUES(3,'10000000-0000-4000-8000-000000000001','checklist_save','tech','{}',now());
    INSERT INTO web_service_operation_events VALUES(2,'10000000-0000-4000-8000-000000000001','checklist_save','tech','Etapa salva',NULL,now());`);
  let result=await orderActivity('1','100');
  assert.equal(result.rows.length,6);
  assert.ok(result.rows.every(r=>!r.action.endsWith('checklist_save')));
  assert.equal(result.rows.find(r=>r.action==='service_order_comment_added')?.author,'Autor original');assert.equal(result.hasMore,false);
  assert.ok(result.rows.every(r=>!r.action.includes('time')&&!r.action.includes('work')));
  assert.equal(result.rows.find(r=>r.action==='field_report_send')?.author,'Técnico');
  assert.ok(result.rows.some(r=>r.position===3&&r.action==='service_operation_created'));
  assert.equal((await orderActivity('2','100')).rows.length,1);
  await db.exec(`INSERT INTO web_access_events(event,actor,email,details) SELECT 'service_order_processed','planner','planner','{"company":1,"order":100}'::jsonb FROM generate_series(1,55);`);
  result=await orderActivity('1','100');assert.equal(result.rows.length,50);assert.equal(result.hasMore,true);
  const next=await orderActivity('1','100',1);assert.equal(next.rows.length,11);assert.equal(next.hasMore,false);
  assert.ok(next.rows.every(r=>!result.rows.some(first=>first.id===r.id)));
  await assert.rejects(orderActivity('99','100'));await assert.rejects(orderActivity('1','100',-1));
 }finally{g.historyPool=old;await db.close();}
});
