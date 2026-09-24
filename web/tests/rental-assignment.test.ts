import { test } from "node:test";
import assert from "node:assert/strict";
import { saveTaskSettings } from "../lib/tasks/settings";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  assignNewRentalTasks,
  RENTAL_ASSIGNEE,
} from "../lib/tasks/rental-assignment";
test("rental origins assign Sara once, preserving completed, manual and already assigned tasks", async () => {
  const db = new PGlite();
  const g = globalThis as any,
    oldPool = g.historyPool;
  g.historyPool = {
    query: db.query.bind(db),
    connect: async () => ({ query: db.query.bind(db), release() {} }),
  };
  try {
    for (const origin of ["Preventiva de Equipamento Locado", "Preventiva de Equipamento Emprestado"]) {
      await assert.rejects(()=>saveTaskSettings({origin,version:1,assignee:null},"admin@example.com"),/Conforme Divisão Comercial/);
    }
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
    for (const f of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "011_task_kanban",
      "012_manual_tasks",
      "015_task_origin_rules",
    ])
      await db.exec(
        readFileSync(new URL("../sql/" + f + ".sql", import.meta.url), "utf8"),
      );
    await db.query(
      `INSERT INTO web_user_access(email,display_name,updated_by) VALUES($1,'Sara','test')`,
      [RENTAL_ASSIGNEE],
    );
    for (const [i, origin, status, source, assigned] of [
      [1, "Máquina de Locação", "not_started", "rental:1", null],
      [2, "Máquina Emprestada", "not_started", "rental:2", null],
      [3, "Máquina de Locação", "completed", "rental:3", null],
      [
        4,
        "Preventiva de Equipamento de Cliente",
        "not_started",
        "plan:4",
        null,
      ],
      [5, "Máquina Emprestada", "not_started", "manual:5", null],
      [6, "Máquina Emprestada", "in_progress", "rental:6", RENTAL_ASSIGNEE],
    ])
      await db.query(
        `INSERT INTO web_tasks(source_key,cycle,equipment_id,origin,title,equipment_name,source_status,status,priority,assigned_to) VALUES($1,'1',$2,$3,'Teste','Máquina','soon',$4,'high',$5)`,
        [source, i, origin, status, assigned],
      );
    await db.query(
      "UPDATE web_task_origin_rules SET assignee=$1 WHERE origin IN ('Máquina de Locação','Máquina Emprestada')",
      [RENTAL_ASSIGNEE],
    );
    const c = { query: db.query.bind(db) } as any;
    const ids = ["1", "2", "3", "4", "5", "6"];
    await assignNewRentalTasks(c, ids);
    await assignNewRentalTasks(c, ids);
    assert.equal(
      (await db.query("SELECT * FROM web_task_notifications")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("SELECT * FROM web_task_notes")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("SELECT * FROM web_tasks WHERE assigned_to IS NULL")).rows
        .length,
      3,
    );
    await db.query("UPDATE web_user_access SET enabled=false WHERE email=$1", [
      RENTAL_ASSIGNEE,
    ]);
    await db.exec("UPDATE web_tasks SET assigned_to=NULL WHERE id=1");
    await assignNewRentalTasks(c, ["1"]);
    assert.equal(
      (await db.query<any>("SELECT assigned_to FROM web_tasks WHERE id=1"))
        .rows[0].assigned_to,
      null,
    );
    await db.exec(
      "INSERT INTO web_user_access(email,display_name,updated_by) VALUES('other@example.com','Outra pessoa','test')",
    );
    await saveTaskSettings(
      {
        origin: "Máquina de Locação",
        version: 1,
        assignee: "other@example.com",
      },
      "admin@example.com",
    );
    await assert.rejects(
      () =>
        saveTaskSettings(
          { origin: "Máquina de Locação", version: 1, assignee: null },
          "admin@example.com",
        ),
      /alterada/,
    );
    await assert.rejects(
      () =>
        saveTaskSettings(
          {
            origin: "Preventiva de Equipamento de Cliente",
            version: 1,
            assignee: "other@example.com",
          },
          "admin@example.com",
        ),
      /indisponível/,
    );
    await assignNewRentalTasks(c, ["1", "2"]);
    assert.equal(
      (await db.query<any>("SELECT assigned_to FROM web_tasks WHERE id=1"))
        .rows[0].assigned_to,
      "other@example.com",
    );
    assert.equal(
      (await db.query<any>("SELECT assigned_to FROM web_tasks WHERE id=2"))
        .rows[0].assigned_to,
      RENTAL_ASSIGNEE,
    );
  } finally {
    g.historyPool = oldPool;
    await db.close();
  }
});
