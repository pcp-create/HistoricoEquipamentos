import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  inspectionForecast,
  collectionDate,
  brazilToday,
} from "../lib/inspections/model";
import {
  saveInspection,
  inspectionsData,
  inspectionRows,
} from "../lib/inspections/store";
import { inspectionSources } from "../lib/inspections/tasks";
import { saveReport } from "../lib/vibration-reports/store";
import { syncTasks } from "../lib/tasks/store";
import { Forbidden } from "../lib/auth";
test("inspection dates handle months, notice windows and collection dates rather than report issuance", () => {
  const p = {
    baseline_date: "2026-01-31",
    interval_value: 1,
    interval_unit: "months",
    notice_days: 10,
  };
  assert.equal(inspectionForecast(p, "2026-02-01").due, "2026-02-28");
  assert.equal(inspectionForecast(p, "2026-02-18").status, "soon");
  assert.equal(inspectionForecast(p, "2026-02-28").status, "due");
  assert.equal(inspectionForecast(p, "2026-03-01").status, "overdue");
  assert.equal(
    inspectionForecast(
      { ...p, interval_unit: "days", interval_value: 15 },
      "2026-01-31",
    ).due,
    "2026-02-15",
  );
  assert.equal(
    inspectionForecast({ ...p, last_date: "2025-01-01" }, "2026-01-31")
      .lastDate,
    "2026-01-31",
  );
  assert.equal(
    collectionDate({
      issued: "2099-01-01",
      equipments: [
        { date: "10/01/2026", components: [] },
        { date: "2026-01-12", components: [] },
      ],
    }),
    "2026-01-12",
  );
  assert.throws(() => collectionDate({ issued: "2026-01-01", equipments: [] }));
  assert.throws(() => collectionDate({ equipments: [{ date: "31/02/2026" }] }));
  assert.throws(() => collectionDate({ equipments: [{ date: "2099-01-01" }] }));
});
test("client inspection cycles assign to estimator, resolve on collection, keep history and generate linked quotes", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated");
    for (const name of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "018_task_assignment_reason",
      "011_task_kanban",
      "012_manual_tasks",
      "016_task_order_links",
      "015_task_origin_rules",
      "013_task_territories",
      "041_task_completion_notifications",
      "042_restricted_tasks",
      "024_task_stages",
      "027_task_stage_assignment",
      "017_task_reminders",
      "023_task_reminder_recurrence",
      "044_task_followers",
      "005_quotes",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + name + ".sql", import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`CREATE TABLE m8_customer_directory(company_id integer,person_id bigint,name text,document text,payload jsonb,collected_at timestamptz DEFAULT now(),PRIMARY KEY(company_id,person_id));
   INSERT INTO m8_customer_directory VALUES(1,1,'Cliente Um','111','{"municipioNome":"Lages","ufSigla":"SC"}',now()),(1,2,'Outro cliente','222','{}',now());
   CREATE TABLE m8_person_equipment(person_id bigint,equipment_id bigint,present boolean);INSERT INTO m8_person_equipment VALUES(1,10,true),(1,11,true),(1,10,true);
   INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('a@test','Gestor','49999999999','test'),('budget@test','Orçamentista','49888888888','test');
   INSERT INTO web_task_territories(city,city_key,uf,assignee,updated_by) VALUES('Lages','LAGES','SC','budget@test','test');`);
    for (const name of [
      "056_vibration_reports",
      "057_vibration_report_customer",
      "080_customer_inspections",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + name + ".sql", import.meta.url),
          "utf8",
        ),
      );
    const query = (sql: string, args?: any[]) =>
      sql.includes("pg_advisory_xact_lock")
        ? Promise.resolve({ rows: [] })
        : db.query(sql.replace("BEGIN READ WRITE", "BEGIN"), args);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const type = (
      await db.query<any>(
        "SELECT id::text FROM web_inspection_types WHERE code='vibration'",
      )
    ).rows[0].id;
    const plan = "11111111-1111-4111-8111-111111111111";
    const b = {
      action: "save",
      id: plan,
      customer: "1",
      typeId: type,
      interval: 6,
      unit: "months",
      noticeDays: 30,
      lastDate: "2020-01-01",
      firstDue: "",
      route: "Rota Serra",
      notes: "",
    };
    await saveInspection(b, "a@test");
    let rows = await inspectionRows();
    assert.equal(rows[0].equipment_count, 2);
    assert.equal(rows[0].forecast.status, "overdue");
    let tasks = (
      await db.query<any>("SELECT * FROM web_tasks WHERE source_key=$1", [
        "inspection:" + plan,
      ])
    ).rows;
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].assigned_to, "budget@test");
    assert.equal(tasks[0].equipment_id, null);
    const oldTask = tasks[0].id;
    await syncTasks(() => inspectionSources(), {
      client: { query } as any,
      inspectionOnly: true,
    });
    assert.equal(
      (await db.query<any>("SELECT count(*) n FROM web_tasks")).rows[0].n,
      1,
    );
    await assert.rejects(() => saveInspection(b, "a@test"), /Já existe/);
    const document = {
      customer: { companyId: 1, personId: "1" },
      title: "Vibração",
      serviceOrder: "OS-123",
      equipments: [
        { machine: "Compressor A", date: brazilToday(), components: [] },
      ],
    };
    const report = await saveReport({ document }, "a@test");
    assert.equal(
      (
        await db.query<any>("SELECT status FROM web_tasks WHERE id=$1", [
          oldTask,
        ])
      ).rows[0].status,
      "completed",
    );
    await saveInspection(
      {
        action: "record",
        id: "22222222-2222-4222-8222-222222222222",
        planId: plan,
        reportId: report.id,
      },
      "a@test",
    );
    assert.equal(
      (
        await db.query<any>("SELECT status FROM web_tasks WHERE id=$1", [
          oldTask,
        ])
      ).rows[0].status,
      "completed",
    );
    assert.equal(
      (
        await db.query<any>(
          "SELECT count(*) n FROM web_task_notifications WHERE task_id=$1 AND kind='completed'",
          [oldTask],
        )
      ).rows[0].n,
      1,
    );
    await saveInspection(
      {
        action: "record",
        id: "33333333-3333-4333-8333-333333333333",
        planId: plan,
        reportId: report.id,
      },
      "a@test",
    );
    assert.equal(
      (await db.query<any>("SELECT count(*) n FROM web_inspection_records"))
        .rows[0].n,
      1,
    );
    rows = await inspectionRows();
    assert.equal(rows[0].forecast.lastDate, brazilToday());
    assert.equal(rows[0].forecast.status, "scheduled");
    await saveInspection(
      {
        action: "record",
        id: "44444444-4444-4444-8444-444444444444",
        planId: plan,
        collectedOn: "2019-01-01",
        notes: "Histórico anterior",
      },
      "a@test",
    );
    assert.equal((await inspectionRows())[0].forecast.lastDate, brazilToday());
    const quoteRequest = "55555555-5555-4555-8555-555555555555";
    const quote = await saveInspection(
      { action: "quote", planId: plan, requestId: quoteRequest },
      "a@test",
    );
    assert.ok(quote.quote.id);
    assert.equal(
      (
        await saveInspection(
          { action: "quote", planId: plan, requestId: quoteRequest },
          "a@test",
        )
      ).quote.id,
      quote.quote.id,
    );
    const q = (
      await db.query<any>("SELECT document FROM web_quotes WHERE id=$1", [
        quote.quote.id,
      ])
    ).rows[0].document;
    assert.equal(q.clientId, "1");
    assert.ok(q.notes.includes(report.id));
    const changed = {
      ...document,
      equipments: [
        { machine: "Compressor A", date: "2020-02-01", components: [] },
      ],
    };
    await saveReport(
      { id: report.id, version: report.version, document: changed },
      "a@test",
    );
    assert.equal((await inspectionRows())[0].forecast.lastDate, "2020-02-01");
    tasks = (
      await db.query<any>(
        "SELECT * FROM web_tasks WHERE source_key=$1 AND status<>'completed'",
        ["inspection:" + plan],
      )
    ).rows;
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].assigned_to, "budget@test");
    await assert.rejects(()=>saveReport({id:report.id,version:2,document:{...document,customer:{companyId:1,personId:'2'}}},'a@test'),/mesmo cliente/);
  const other = await saveReport(
      { document: { ...document, customer: { companyId: 1, personId: "2" } } },
      "a@test",
    );
    await assert.rejects(
      () =>
        saveInspection(
          {
            action: "record",
            id: crypto.randomUUID(),
            planId: plan,
            reportId: other.id,
          },
          "a@test",
        ),
      /mesmo cliente/,
    );
    await assert.rejects(
      () => saveInspection({ ...b, version: 99, active: true }, "a@test"),
      /alterado/,
    );
    await assert.rejects(
      () => saveInspection({ ...b, id: crypto.randomUUID() }, "missing@test"),
      Forbidden,
    );
    const data = await inspectionsData(
      "a@test",
      new URLSearchParams({ plan, report: report.id }),
    );
    assert.equal(data.records.length, 2);
    assert.equal(data.quotes.length, 1);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
