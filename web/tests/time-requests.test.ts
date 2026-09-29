import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { syncTasks, updateTask } from "../lib/tasks/store";
import { PGlite } from "@electric-sql/pglite";
import {
  changeTimeRequest,
  personalTimeLogs,
} from "../lib/service-scheduling/time-request-store";
test("requests require managers, stay pending, approve once, retain originals and reject self/outsider/overlapping changes", async () => {
  const db = new PGlite();
  (globalThis as any).historyPool = {
    query: db.query.bind(db),
    connect: async () => ({ query: db.query.bind(db), release() {} }),
  };
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
    for (const name of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "012_manual_tasks",
      "016_task_order_context",
      "028_service_scheduling",
      "030_service_schedule_visibility",
      "037_field_operations",
      "038_time_adjustment_requests",
    ]) {
      // 016 schema is small; load it using the repository's actual filename below.
      if (name === "016_task_order_context") {
        await db.exec(
          "ALTER TABLE web_tasks ADD COLUMN order_company integer;ALTER TABLE web_tasks ADD COLUMN order_id bigint;ALTER TABLE web_tasks ADD COLUMN order_number text;ALTER TABLE web_tasks ADD COLUMN source_resolved boolean DEFAULT false;",
        );
        continue;
      }
      await db.exec(
        readFileSync(
          new URL("../sql/" + name + ".sql", import.meta.url),
          "utf8",
        ),
      );
    }
    await db.exec(`CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,equipamento text,cliente_nome text);
 INSERT INTO m8_ordens_servico VALUES(1,100,100,'Compressor','Cliente');
 INSERT INTO web_user_access(email,display_name,role,updated_by) VALUES('tech','Técnico','user','test'),('manager','Gestor','admin','test'),('manager2','Gestor 2','admin','test'),('outsider','Outro','admin','test');
 UPDATE web_user_access SET managers='["manager","manager2"]' WHERE email='tech';`);
    const schedule = (
      await db.query<any>(
        "INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'test') RETURNING id",
      )
    ).rows[0].id;
    const op = randomUUID(),
      session = randomUUID();
    await db.query(
      "INSERT INTO web_service_operations(id,schedule_id,position,document,updated_by,sent_at) VALUES($1,$2,1,$3,'test',now())",
      [
        op,
        schedule,
        JSON.stringify({
          responsible: "tech",
          support: [],
          description: "Revisão",
        }),
      ],
    );
    await db.query(
      "INSERT INTO web_field_sessions(id,operation_id,actor,kind,state,started_at,finished_at,segment_at,active_seconds) VALUES($1,$2,'tech','work','finished','2026-01-01T08:00Z','2026-01-01T09:00Z','2026-01-01T09:00Z',3600)",
      [session, op],
    );
    await db.query(
      "INSERT INTO web_service_operation_events(operation_id,actor,action,hours,created_at) VALUES($1,'tech','work_log',1,'2026-01-01T09:00Z')",
      [op],
    );
    const proposed = {
      started_at: "2026-01-01T08:00:00Z",
      finished_at: "2026-01-01T10:00:00Z",
      pauses: [],
    };
    const input = () => ({
      action: "request",
      requestId: randomUUID(),
      operationId: op,
      sessionId: session,
      version: 0,
      reason: "Esqueci de finalizar na hora correta",
      proposed,
      location: {
        latitude: -27,
        longitude: -49,
        accuracy: 10,
        at: new Date().toISOString(),
      },
    });
    await assert.rejects(
      changeTimeRequest(input(), "outsider"),
      (e: any) => e.constructor.name === "Forbidden",
    );
    const b = input(),
      result = await changeTimeRequest(b, "tech");
    assert.equal((await changeTimeRequest(b, "tech")).id, result.id);
    assert.equal(
      (
        await db.query<any>(
          "SELECT active_seconds FROM web_field_sessions WHERE id=$1",
          [session],
        )
      ).rows[0].active_seconds,
      "3600",
    );
    assert.equal((await db.query("SELECT * FROM web_tasks")).rows.length, 2);
    const notifications = (await db.query<any>(
      "SELECT n.recipient,n.state,n.task_version,t.assigned_to FROM web_task_notifications n JOIN web_tasks t ON t.id=n.task_id ORDER BY n.recipient",
    )).rows;
    assert.deepEqual(notifications.map(n => n.recipient), ["manager", "manager2"]);
    assert.ok(notifications.every(n => n.state === "pending" && n.task_version === 1 && n.recipient === n.assigned_to));
    // Repeating the same request above must not enqueue duplicate messages.
    await syncTasks(async () => []);
    assert.equal(
      (await db.query("SELECT * FROM web_tasks WHERE status='not_started'"))
        .rows.length,
      2,
    );
    const task = (await db.query<any>("SELECT * FROM web_tasks LIMIT 1"))
      .rows[0];
    await assert.rejects(
      updateTask(
        {
          id: String(task.id),
          version: task.version,
          action: "move",
          column: "completed",
        },
        { id: "m", email: "manager" },
      ),
      /Aprovar Solicitação/,
    );

    await assert.rejects(changeTimeRequest(input(), "tech"), /aguardando/);
    await assert.rejects(
      changeTimeRequest({ action: "approve", id: result.id }, "tech"),
      (e: any) => e.constructor.name === "Forbidden",
    );
    await assert.rejects(
      changeTimeRequest({ action: "approve", id: result.id }, "outsider"),
      (e: any) => e.constructor.name === "Forbidden",
    );
    await changeTimeRequest({ action: "approve", id: result.id }, "manager");
    await assert.rejects(
      changeTimeRequest({ action: "approve", id: result.id }, "manager2"),
      /já foi/,
    );
    const saved = (
      await db.query<any>("SELECT * FROM web_field_sessions WHERE id=$1", [
        session,
      ])
    ).rows[0];
    assert.equal(Number(saved.active_seconds), 3600);
    assert.equal(saved.correction.active_seconds, 7200);
    assert.equal(
      Number(
        (
          await db.query<any>(
            "SELECT hours FROM web_service_operation_events WHERE action='work_log'",
          )
        ).rows[0].hours,
      ),
      2,
    );
    assert.equal(
      (await db.query("SELECT * FROM web_tasks WHERE status<>'completed'")).rows
        .length,
      0,
    );
    const manual = {
      ...input(),
      sessionId: undefined,
      kind: "travel",
      proposed: {
        started_at: "2026-01-02T08:00:00Z",
        finished_at: "2026-01-02T09:00:00Z",
        pauses: [],
      },
    };
    const m = await changeTimeRequest(manual, "tech");
    assert.equal(
      (await db.query("SELECT * FROM web_field_sessions")).rows.length,
      1,
    );
    await changeTimeRequest({ action: "approve", id: m.id }, "manager2");
    assert.equal(
      (await db.query("SELECT * FROM web_field_sessions")).rows.length,
      2,
    );
    const conflicting = { ...manual, requestId: randomUUID() };
    await assert.rejects(changeTimeRequest(conflicting, "tech"), /coincide/);
    const direct = {
      ...input(),
      action: "planner_adjust",
      version: 1,
      proposed: { ...proposed, finished_at: "2026-01-01T11:00:00Z" },
    };
    await assert.rejects(
      changeTimeRequest(direct, "tech"),
      (e: any) => e.constructor.name === "Forbidden",
    );
    await changeTimeRequest(direct, "manager");
    assert.equal(
      (
        await db.query<any>(
          "SELECT correction FROM web_field_sessions WHERE id=$1",
          [session],
        )
      ).rows[0].correction.active_seconds,
      10800,
    );
    const reject = await changeTimeRequest({ ...input(), version: 2 }, "tech");
    await changeTimeRequest(
      { action: "reject", id: reject.id, reason: "Horário não confere" },
      "manager",
    );
    assert.equal(
      (
        await db.query<any>(
          "SELECT status FROM web_field_time_requests WHERE id=$1",
          [reject.id],
        )
      ).rows[0].status,
      "rejected",
    );
    const legacy = (
      await db.query<any>(
        "INSERT INTO web_service_operation_events(operation_id,actor,action,hours,created_at) VALUES($1,'tech','work_log',3,'2026-01-03T15:00Z') RETURNING id",
        [op],
      )
    ).rows[0].id;
    const legacyRequest = await changeTimeRequest(
      {
        ...input(),
        sessionId: undefined,
        legacyEventId: legacy,
        proposed: {
          started_at: "2026-01-03T08:00:00Z",
          finished_at: "2026-01-03T10:00:00Z",
          pauses: [],
        },
      },
      "tech",
    );
    await changeTimeRequest(
      { action: "approve", id: legacyRequest.id },
      "manager",
    );
    assert.equal(
      Number(
        (
          await db.query<any>(
            "SELECT hours FROM web_service_operation_events WHERE id=$1",
            [legacy],
          )
        ).rows[0].hours,
      ),
      2,
    );
    const logs = await personalTimeLogs("tech");
    assert.equal(logs.requests.length, 5);
    assert.equal(logs.fieldSessions.length, 3);
    await db.exec(
      "UPDATE web_user_access SET managers='[]' WHERE email='tech'",
    );
    await assert.rejects(
      changeTimeRequest({ ...input(), version: 2 }, "tech"),
      /gestor ativo/,
    );
    await db.exec("ALTER TABLE web_field_time_requests RENAME TO web_field_time_requests_unavailable");
    const beforeMigration=await personalTimeLogs("tech");
    assert.equal(beforeMigration.timeAdjustmentsAvailable,false);
    assert.equal(beforeMigration.fieldSessions.length,3);
    assert.deepEqual(beforeMigration.requests,[]);
    await assert.rejects(changeTimeRequest({...input(),version:2},"tech"),/ainda não estão habilitadas/);
  } finally {
    delete (globalThis as any).historyPool;
    await db.close();
  }
});
