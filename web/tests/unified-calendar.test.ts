import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { calendarEvents } from "../lib/calendar/store";
import {
  calendarDay,
  calendarRange,
  filterCalendarEvents,
} from "../lib/calendar/model";
test("personal calendar combines technician, seller and follower events without leaking other users or restricted tasks", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE web_calendar_appointments(id uuid,owner text,title text,kind text,starts_at timestamptz,ends_at timestamptz,all_day boolean,visibility text,description text,version int,cancelled_at timestamptz);
 CREATE TABLE web_user_access(email text,enabled boolean,role text,display_name text);
 INSERT INTO web_user_access VALUES('dual@test',true,'user','Técnico e vendedor'),('admin@test',true,'admin','Admin'),('disabled@test',false,'user','Inativo');
 CREATE TABLE web_service_schedules(id int,company_id int,order_id int,active boolean);
 INSERT INTO web_service_schedules VALUES(1,1,101,true),(2,1,102,false);
 CREATE TABLE m8_ordens_servico(company_id int,id_m8 int,numero_sequencia int,cliente_nome text);
 INSERT INTO m8_ordens_servico VALUES(1,101,15000,'Cliente OS'),(1,102,15001,'Removida');
 CREATE TABLE web_service_operations(id int,schedule_id int,position int,status text,document jsonb,sent_at timestamptz);
 INSERT INTO web_service_operations VALUES
 (1,1,1,'executing','{"date":"2026-11-18","time":"08:30","responsible":"dual@test","support":["support@test"]}',now()),
 (2,1,2,'awaiting_review','{"date":"2026-11-18","responsible":"other@test","support":["dual@test"]}',now()),
 (3,1,3,'scheduled','{"date":"2026-11-18","responsible":"other@test"}',now()),
 (4,1,4,'scheduled','{"date":"2026-11-18","responsible":"dual@test"}',null),
 (5,2,1,'scheduled','{"date":"2026-11-18","responsible":"dual@test"}',now()),
 (6,1,6,'executing','{"date":"2026-11-18","responsible":"dual@test","technicianClosures":{"dual@test":{}}}',now()),
 (7,1,7,'scheduled','{"date":"2026-12-01","responsible":"dual@test"}',now());
 CREATE TABLE web_sales_visit_purposes(id int,name text);INSERT INTO web_sales_visit_purposes VALUES(1,'Apresentação');
 CREATE TABLE web_sales_leads(id text,name text);INSERT INTO web_sales_leads VALUES('lead','Lead compartilhado');
 CREATE TABLE m8_customer_directory(person_id int,name text,collected_at timestamptz,company_id int);
 INSERT INTO m8_customer_directory VALUES(22,'Cliente atual',now(),1),(22,'Nome antigo',now()-interval '1 day',2);
 CREATE TABLE web_sales_visits(id int,scheduled_at timestamptz,status text,description text,purpose_id int,customer_key text,seller text);
 INSERT INTO web_sales_visits VALUES
 (1,'2026-11-19T02:59:59Z','scheduled','Visita noturna',1,'lead:lead','dual@test'),
 (2,'2026-11-19T03:00:00Z','completed','Outro dia',1,'m8:22','dual@test'),
 (3,'2026-11-18T03:00:00Z','completed','Visita cedo',1,'m8:22','dual@test'),
 (4,'2026-11-18T02:59:59Z','scheduled','Dia anterior',1,'m8:22','dual@test'),
 (5,'2026-11-18T15:00:00Z','scheduled','Visita alheia',1,'m8:22','other@test');
 CREATE TABLE web_tasks(id int,due_date date,title text,customer text,status text,equipment_name text,assigned_to text,followers text[],restricted boolean);
 INSERT INTO web_tasks VALUES(1,'2026-11-18','Minha tarefa','Cliente','not_started','Máquina','dual@test','{}',false),
 (2,'2026-11-18','Em acompanhamento','Cliente','completed','','other@test','{dual@test}',false),
 (3,'2026-11-18','Segredo','Privado','not_started','','dual@test','{admin@test}',true),
 (4,'2026-11-18','Alheia','','not_started','','other@test','{}',false),
 (5,null,'Sem data','','not_started','','dual@test','{}',false);`);
    const result = await calendarEvents(
      "DUAL@test",
      "2026-11-18",
      "2026-11-18",
      db,
    );
    const all=await calendarEvents('dual@test','2026-11-18','2026-11-18',db,'all');
    assert(all.events.some(e=>e.id==='operation:3'));
    assert(all.events.some(e=>e.id==='visit:5'));
    assert(!all.events.some(e=>e.id==='task:3'));
    await db.exec(`INSERT INTO web_calendar_appointments VALUES('11111111-1111-4111-8111-111111111111','other@test','Privado','personal','2026-11-18T03:00Z','2026-11-19T02:59Z',true,'private','',1,null),('22222222-2222-4222-8222-222222222222','other@test','Folga','leave','2026-11-18T03:00Z','2026-11-20T02:59Z',true,'team','',1,null)`);
    const appointments=(await calendarEvents('dual@test','2026-11-18','2026-11-19',db,'all',true)).events.filter(e=>e.source==='appointments');
    assert.equal(appointments.length,2);assert(appointments.every(e=>e.title==='Folga'&&!e.appointment?.editable));
    assert.deepEqual(
      result.events.map((e) => e.id).sort(),
      [
        "operation:1",
        "operation:2",
        "operation:6",
        "visit:1",
        "visit:3",
        "task:1",
        "task:2",
      ].sort(),
    );
    assert.equal(result.events.find((e) => e.id === "visit:1")?.time, "23:59");
    assert.equal(
      result.events.find((e) => e.id === "visit:1")?.customer,
      "Lead compartilhado",
    );
    assert.equal(
      result.events.find((e) => e.id === "visit:3")?.customer,
      "Cliente atual",
    );
    assert.equal(
      result.events.find((e) => e.id === "operation:2")?.state,
      "completed",
    );
    assert.equal(
      result.events.find((e) => e.id === "operation:6")?.state,
      "completed",
    );
    assert.equal(
      result.events.find((e) => e.id === "operation:1")?.href,
      "/tecnico?operation=1",
    );
    assert.deepEqual(
      (
        await calendarEvents("admin@test", "2026-11-18", "2026-11-18", db)
      ).events.map((e) => e.id),
      ["task:3"],
    );
    for (const email of ["disabled@test", "missing@test"])
      await assert.rejects(
        calendarEvents(email, "2026-11-18", "2026-11-18", db),
      );
    for (const [start, end] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-11-19", "2026-11-18"],
      ["2026-01-01", "2026-12-31"],
      ["bad", "2026-11-18"],
    ])
      await assert.rejects(calendarEvents("dual@test", start, end, db));
    await db.exec(
      "UPDATE web_sales_visits SET status='cancelled' WHERE id=1;DELETE FROM web_service_operations WHERE id=1;UPDATE web_tasks SET due_date='2026-11-19' WHERE id=1",
    );
    const next = await calendarEvents(
      "dual@test",
      "2026-11-18",
      "2026-11-18",
      db,
    );
    assert.equal(
      next.events.find((e) => e.id === "visit:1")?.state,
      "cancelled",
    );
    assert.ok(
      !next.events.some((e) => ["operation:1", "task:1"].includes(e.id)),
    );
    assert.equal(
      filterCalendarEvents(next.events, "visits", "cancelled", "noturna")
        .length,
      1,
    );
    assert.equal(
      filterCalendarEvents(next.events, "tasks", "completed", "acompanhamento")
        .length,
      1,
    );
  } finally {
    await db.close();
  }
});
test("date boundaries use Brasília and handle month and week transitions", () => {
  assert.equal(calendarDay("2026-11-19T02:59:59Z"), "2026-11-18");
  assert.deepEqual(calendarRange("2026-11-01", "week"), {
    start: "2026-11-01",
    end: "2026-11-07",
  });
  assert.deepEqual(calendarRange("2026-12-31", "week"), {
    start: "2026-12-27",
    end: "2027-01-02",
  });
  assert.deepEqual(calendarRange("2028-02-20", "month"), {
    start: "2028-02-01",
    end: "2028-02-29",
  });
});
