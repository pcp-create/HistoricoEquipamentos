import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  mutateSchedule,
  scheduleTaskLists,
} from "../lib/service-scheduling/store";
import { blankOperation } from "../lib/service-scheduling/model";
import {
  allTaskListFields,
  operationSnapshot,
} from "../lib/service-scheduling/task-list-model";

test("task lists copy selected planning fields, replace atomically, preserve execution and reject stale changes", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool,
    query = db.query.bind(db);
  g.historyPool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const file of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "011_task_kanban",
      "012_manual_tasks",
      "016_task_order_links",
      "022_task_activity_progress",
      "028_service_scheduling",
      "029_order_links",
      "030_service_schedule_visibility",
      "031_schedule_item_sources",
      "037_field_operations",
      "038_time_adjustment_requests",
      "039_material_withdrawals",
      "059_schedule_task_lists",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + file + ".sql", import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,serial text,present boolean);INSERT INTO m8_equipment_catalog VALUES(20,'Compressor','SN1',true);
  CREATE TABLE web_service_checklist_photos(id bigint,operation_id uuid);
  INSERT INTO web_user_access(email,display_name,job_title,role,updated_by) VALUES('planner@test.com','Planejador','Técnico','user','test'),('support@test.com','Apoio','Técnico','user','test');
  INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'test'),(1,200,'test');`);
    const user = "planner@test.com";
    const docs = [
      {
        ...blankOperation(),
        description: "Inspeção",
        serviceType: "Interno",
        equipmentId: "20",
        responsible: user,
        support: ["support@test.com"],
        duration: 2,
        date: "2026-10-21",
        time: "09:00",
        internalNote: "Levar ferramentas",
        checklistRun: { answers: { x: "não copiar" } },
        firstSentAt: "2026-10-20",
      },
      { ...blankOperation(), description: "Limpeza", duration: 1 },
    ];
    for (let i = 0; i < docs.length; i++)
      await query(
        "INSERT INTO web_service_operations(id,schedule_id,position,document,updated_by) VALUES($1,1,$2,$3,$4)",
        [
          `10000000-0000-4000-8000-00000000000${i + 1}`,
          i + 1,
          JSON.stringify(docs[i]),
          user,
        ],
      );
    const read = async (sid = 1): Promise<any[]> =>
      (
        await query(
          "SELECT * FROM web_service_operations WHERE schedule_id=$1 ORDER BY position",
          [sid],
        )
      ).rows;
    const source = {
      sourceScheduleId: "1",
      expectedOperations: operationSnapshot(await read()),
    };
    const full = await mutateSchedule(
      {
        action: "task_list_save",
        name: "Preventiva",
        fields: allTaskListFields,
        ...source,
      },
      user,
    );
    assert.equal(full.list.document.operations[0].date, "");
    assert.equal(full.list.document.operations[0].time, "");
    assert.equal(full.list.document.operations[0].checklistRun, undefined);
    assert.equal(full.list.document.operations[0].firstSentAt, undefined);
    assert.equal(full.list.document.operations[0].equipment.name, "Compressor");
    assert.equal(full.list.document.operations[0].responsible, user);
    assert.equal(full.list.document.operations[0].jobTitle, "Técnico");
    const partial = await mutateSchedule(
      {
        action: "task_list_save",
        name: "Somente descrição e duração",
        fields: ["description", "duration"],
        ...source,
      },
      user,
    );
    assert.equal(partial.list.document.operations[0].responsible, "");
    assert.equal(partial.list.document.operations[0].equipmentId, "");
    assert.deepEqual(partial.list.document.operations[0].support, []);
    assert.equal(partial.list.document.operations[0].duration, 2);
    await assert.rejects(
      mutateSchedule(
        {
          action: "task_list_save",
          name: "preventiva",
          fields: ["description"],
          operations: docs,
        },
        user,
      ),
      /existe/,
    );
    await assert.rejects(
      mutateSchedule(
        {
          action: "task_list_save",
          name: "Inválida",
          fields: ["date"],
          operations: docs,
        },
        user,
      ),
      /campos/,
    );
    await assert.rejects(
      mutateSchedule(
        {
          action: "task_list_save",
          name: "Sem acesso",
          fields: ["description"],
          operations: docs,
        },
        "missing@test.com",
      ),
    );
    const apply = {
      action: "task_list_apply",
      scheduleId: "2",
      id: full.list.id,
      version: 1,
      expectedOperations: [],
      confirmReplace: true,
    };
    const applied = await mutateSchedule(apply, user);
    assert.deepEqual(
      applied.operations.map((o: any) => o.document.description),
      ["Inspeção", "Limpeza"],
    );
    assert.ok(
      applied.operations.every(
        (o: any) =>
          o.status === "pending" &&
          !o.sent_at &&
          !o.ends_at &&
          !o.document.date &&
          !o.document.time,
      ),
    );
    await assert.rejects(mutateSchedule(apply, user), /alteradas/);
    const target = await read(2),
      expected = operationSnapshot(target);
    await assert.rejects(
      mutateSchedule(
        { ...apply, expectedOperations: expected, confirmReplace: false },
        user,
      ),
      /Confirme/,
    );
    // Late validation failure must preserve all current operations.
    await query("UPDATE web_user_access SET enabled=false WHERE email=$1", [
      user,
    ]);
    await assert.rejects(
      mutateSchedule(
        { ...apply, expectedOperations: expected },
        "support@test.com",
      ),
      /ativos/,
    );
    assert.deepEqual(operationSnapshot(await read(2)), expected);
    await query("UPDATE web_user_access SET enabled=true WHERE email=$1", [
      user,
    ]);
    await query(
      "UPDATE web_service_operations SET sent_at=now(),status='awaiting_execution' WHERE id=$1",
      [target[0].id],
    );
    await assert.rejects(
      mutateSchedule({ ...apply, expectedOperations: expected }, user),
      /enviadas/,
    );
    await query(
      "UPDATE web_service_operations SET sent_at=NULL,status='pending' WHERE id=$1",
      [target[0].id],
    );
    await query(
      "INSERT INTO web_field_sessions(id,operation_id,actor,kind,state) VALUES('20000000-0000-4000-8000-000000000001',$1,$2,'work','finished')",
      [target[0].id, user],
    );
    await assert.rejects(
      mutateSchedule({ ...apply, expectedOperations: expected }, user),
      /registros/,
    );
    await query("DELETE FROM web_field_sessions");
    await query(
      "INSERT INTO web_service_item_usage(schedule_id,item_id,item_company,item_order,operation_id,withdrawn,updated_by) VALUES(2,10,1,200,$1,1,$2)",
      [target[0].id, user],
    );
    await assert.rejects(
      mutateSchedule({ ...apply, expectedOperations: expected }, user),
      /peças/,
    );
    await query("DELETE FROM web_service_item_usage");
    const replaced = await mutateSchedule(
      { ...apply, id: partial.list.id, expectedOperations: expected },
      user,
    );
    assert.equal(replaced.operations.length, 2);
    assert.notEqual(replaced.operations[0].id, target[0].id);
    assert.equal(replaced.operations[0].document.responsible, "");
    const audit: any = (
      await query(
        "SELECT details FROM web_access_events WHERE event='service_task_list_applied' ORDER BY id DESC LIMIT 1",
      )
    ).rows[0];
    assert.equal(audit.details.replaced.length, 2);
    const updated = await mutateSchedule(
      {
        action: "task_list_save",
        id: partial.list.id,
        version: 1,
        name: "Atualizada",
        fields: ["description"],
        operations: [{ description: "Outra operação" }],
      },
      user,
    );
    assert.equal(updated.list.version, 2);
    await assert.rejects(
      mutateSchedule(
        { action: "task_list_delete", id: updated.list.id, version: 1 },
        user,
      ),
      /alterada/,
    );
    await mutateSchedule(
      { action: "task_list_delete", id: updated.list.id, version: 2 },
      user,
    );
    assert.equal((await scheduleTaskLists(user)).lists.length, 1);
    assert.equal((await read(2)).length, 2);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
