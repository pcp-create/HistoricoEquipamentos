import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  loadOrderReport,
  validateOrderReportSelection,
} from "../lib/service-scheduling/order-report-store";
const one = "10000000-0000-4000-8000-000000000001",
  two = "20000000-0000-4000-8000-000000000002";
test("unified export validates selection, scopes data to the OS, and checks current review and photo ownership", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  g.historyPool = {
    connect: async () => ({ query: db.query.bind(db), release() {} }),
  };
  try {
    await db.exec(`CREATE TABLE web_user_access(email text,role text,enabled boolean,display_name text);
   INSERT INTO web_user_access VALUES('admin','admin',true,'Planejador'),('tech','user',true,'Técnico'),('disabled','admin',false,'Desativado');
   CREATE TABLE web_service_schedules(id bigint,company_id integer,order_id bigint);
   INSERT INTO web_service_schedules VALUES(1,1,100),(2,2,100);
   CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,cliente_nome text);
   INSERT INTO m8_ordens_servico VALUES(1,100,14877,'Cliente correto'),(2,100,99,'Outra empresa');
   CREATE TABLE web_service_operations(id uuid,schedule_id bigint,position integer,status text,document jsonb);
   CREATE TABLE web_field_sessions(id text,operation_id uuid,actor text);
   CREATE TABLE web_field_events(id bigint,operation_id uuid,actor text,action text,created_at timestamptz);
   CREATE TABLE web_service_operation_events(id bigint,operation_id uuid,actor text);
   CREATE TABLE web_service_checklist_photos(id bigint,operation_id uuid,content bytea);`);
    const run = {
      template: {
        name: "Teste",
        stages: [
          {
            id: "s",
            name: "Fotos",
            fields: [{ id: "photo", label: "Foto", type: "photo" }],
          },
        ],
      },
      stages: { s: { status: "submitted", answers: { photo: ["1"] } } },
    };
    await db.query(
      "INSERT INTO web_service_operations VALUES($1,1,1,'reviewed',$3),($2,2,1,'completed',$3)",
      [one, two, JSON.stringify({ responsible: "tech", checklistRun: run })],
    );
    await db.query(
      "INSERT INTO web_service_checklist_photos VALUES(1,$1,decode('abcd','hex'))",
      [one],
    );
    const body = { scheduleId: "1", operationIds: [one], mode: "complete" };
    assert.throws(
      () => validateOrderReportSelection({ ...body, operationIds: [] }),
      /Selecione/,
    );
    assert.throws(
      () => validateOrderReportSelection({ ...body, operationIds: [one, one] }),
      /repetidas/,
    );
    assert.throws(
      () => validateOrderReportSelection({ ...body, mode: "unsafe" }),
      /Tipo/,
    );
    assert.throws(
      () =>
        validateOrderReportSelection({ ...body, operationIds: ["invalid"] }),
      /Selecione/,
    );
    for (const user of ["tech", "disabled", "unknown"])
      await assert.rejects(loadOrderReport(body, user));
    await assert.rejects(
      loadOrderReport({ ...body, operationIds: [one, two] }, "admin"),
      /somente operações desta OS/,
    );
    const result = await loadOrderReport(body, "admin");
    assert.equal(result.model.order, "14877");
    assert.equal(result.photos.length, 1);
    assert.equal(result.model.chapters.length, 1);
    assert.ok(!JSON.stringify(result.model).includes("Outra empresa"));
    await db.query(
      "UPDATE web_service_operations SET status='awaiting_review' WHERE id=$1",
      [one],
    );
    await assert.rejects(
      loadOrderReport(body, "admin"),
      /ainda não foi revisada/,
    );
    await db.query(
      "UPDATE web_service_operations SET status='reviewed' WHERE id=$1",
      [one],
    );
    await db.query("UPDATE web_service_checklist_photos SET operation_id=$1", [
      two,
    ]);
    await assert.rejects(loadOrderReport(body, "admin"), /fotos indisponíveis/);
    await db.query(
      "UPDATE web_service_operations SET document='{}' WHERE id=$1",
      [one],
    );
    await assert.rejects(
      loadOrderReport(body, "admin"),
      /não possui relatório/,
    );
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
