import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {monthBounds,splitLog,productivityMap} from '../lib/technical-productivity/model';
import {technicalProductivity} from '../lib/technical-productivity/store';

test('map splits logged time across days and assigns planned hours to the team',()=>{
 assert.equal(monthBounds('2024-02').days,29);assert.throws(()=>monthBounds('2026-13'));
 const log={started_at:'2026-11-03T02:00:00Z',finished_at:'2026-11-03T05:00:00Z',active:7200,total:10800,pauses:[{start:'2026-11-03T02:30:00Z',end:'2026-11-03T03:30:00Z'}]};
 const parts=splitLog(log);assert.equal(parts.length,2);assert.equal(parts[0].date,'2026-11-02');assert.equal(parts[0].seconds,3600);assert.equal(parts[1].seconds,7200);
 const op={id:'op',position:1,order_id:10,document:{date:'2026-11-02',time:'08:00',duration:2,calendarId:'standard',responsible:'a',support:['b']}};
 const result=productivityMap('2026-11',[{email:'a',display_name:'Ana'},{email:'b',display_name:'Bruno'}],[op],[],[],[],[{id:'standard',week:[{day:1,start:'08:00',end:'18:00'}]}]);
 assert.equal(result.users[0].days['2026-11-02'].planned,2);assert.equal(result.users[1].days['2026-11-02'].planned,2);
 const later={...op,id:'later',document:{...op.document,time:'14:00',duration:1}};
 const sorted=productivityMap('2026-11',[{email:'a',display_name:'Ana'}],[later,op],[],[],[],[{id:'standard',week:[{day:1,start:'08:00',end:'18:00'}]}]);
 assert.deepEqual(sorted.users[0].days['2026-11-02'].details.map((d:any)=>d.start),['2026-11-02T11:00:00.000Z','2026-11-02T17:00:00.000Z']);
});

test('personal endpoint data contains only the selected technician and deduplicates mirrored time events',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{
 await db.exec(`CREATE TABLE web_user_access(email text,display_name text,job_title text,job_titles jsonb,enabled boolean); INSERT INTO web_user_access VALUES('a@test','Ana','Técnico','["Técnico"]',true),('b@test','Bruno','Técnico','["Técnico"]',true),('admin@test','Administrador','Técnico',null,true),('other@test','Outro','Gestor','["Gestor"]',true);
 CREATE TABLE web_service_schedule_settings(id int,document jsonb);INSERT INTO web_service_schedule_settings VALUES(1,'{"calendars":[{"id":"standard","week":[{"day":1,"start":"08:00","end":"18:00"}]}]}');
 CREATE TABLE web_service_schedules(id bigint,company_id int,order_id bigint,active boolean); INSERT INTO web_service_schedules VALUES(1,1,44,true);
 CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text); INSERT INTO m8_ordens_servico VALUES(1,44,123,'Cliente Teste','Compressor');
 CREATE TABLE web_service_operations(id uuid,schedule_id bigint,position int,document jsonb,ends_at timestamptz,sent_at timestamptz); INSERT INTO web_service_operations VALUES('00000000-0000-4000-8000-000000000001',1,1,'{"date":"2026-11-02","time":"08:00","duration":2,"calendarId":"standard","responsible":"a@test","support":["b@test"]}','2026-11-02 13:00Z','2026-11-01 00:00Z');
 CREATE TABLE web_service_operation_events(id bigint,operation_id uuid,actor text,action text,hours numeric,description text,created_at timestamptz); INSERT INTO web_service_operation_events VALUES(10,'00000000-0000-4000-8000-000000000001','a@test','work_log',2,'', '2026-11-02 13:00Z');
 CREATE TABLE web_field_sessions(id uuid,operation_id uuid,actor text,kind text,state text,started_at timestamptz,segment_at timestamptz,finished_at timestamptz,active_seconds numeric,pause_seconds numeric,correction jsonb,legacy_event_id bigint); INSERT INTO web_field_sessions VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','a@test','work','finished','2026-11-02 11:00Z','2026-11-02 13:00Z','2026-11-02 13:00Z',7200,0,null,10);
 CREATE TABLE web_field_events(id bigint,operation_id uuid,actor text,action text,created_at timestamptz,document jsonb);`);
 const query=db.query.bind(db);g.historyPool={query};
 const r=await technicalProductivity('2026-11','a@test');assert.equal(r.users.length,1);assert.equal(r.users[0].name,'Ana');assert.equal(r.users[0].days['2026-11-02'].planned,2);assert.equal(r.users[0].days['2026-11-02'].logged,2);assert.equal(r.users[0].days['2026-11-02'].details[0].customer,'Cliente Teste');assert.equal(r.users[0].days['2026-11-02'].details[1].equipment,'Compressor');
 assert.deepEqual(r.users[0].days['2026-11-02'].details.map((d:any)=>d.kind),['planned','logged']);
 const all=await technicalProductivity('2026-11');assert.deepEqual(all.users.map((u:any)=>u.name),['Ana','Bruno']);
 assert.equal((await technicalProductivity('2026-11','admin@test')).users.length,0);
 }finally{g.historyPool=old;await db.close()}
});
