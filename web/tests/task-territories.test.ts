import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  assignNewTasks,
  saveTerritory,
  territoryList,
} from "../lib/tasks/territories";
test("territory CRUD and automatic assignment require unambiguous city/state, preserve existing owners and audit changes", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const file of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "011_task_kanban",
      "012_manual_tasks",
      "015_task_origin_rules",
      "013_task_territories",
      "014_task_territory_columns",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + file + ".sql", import.meta.url),
          "utf8",
        ),
      );
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    await db.exec(
      `INSERT INTO web_user_access(email,display_name,updated_by) VALUES('a@example.com','Pessoa A','test'),('b@example.com','Pessoa B','test'); CREATE TABLE m8_person_equipment(equipment_id bigint,person_id bigint,company_id integer,present boolean); CREATE TABLE m8_customer_directory(person_id bigint,company_id integer,payload jsonb);`,
    );
    await saveTerritory(
      {
        action: "save",
        city: "São José",
        uf: "SC",
        assignee: "a@example.com",
        mesoregion: "Grande Florianópolis",
        microregion: "Florianópolis",
        seller: "Bruno",
      },
      "admin@example.com",
    );
    const saved = (await territoryList()).rules[0];
    assert.equal(saved.mesoregion, "Grande Florianópolis");
    assert.equal(saved.microregion, "Florianópolis");
    assert.equal(saved.seller, "Bruno");
    await assert.rejects(
      () =>
        saveTerritory(
          {
            action: "save",
            city: "Sao Jose",
            uf: "SC",
            assignee: "b@example.com",
          },
          "admin@example.com",
        ),
      /Já existe/,
    );
    await saveTerritory(
      { action: "save", city: "São José", uf: "PR", assignee: "b@example.com" },
      "admin@example.com",
    );
    await db.exec(
      `INSERT INTO m8_customer_directory VALUES(1,1,'{"municipioNome":"SAO JOSE","ufSigla":"SC"}'),(2,1,'{"municipioNome":"SÃO JOSÉ","ufSigla":"PR"}'); INSERT INTO m8_person_equipment VALUES(1,1,1,true),(2,1,1,true),(2,2,1,true); INSERT INTO web_tasks(source_key,cycle,equipment_id,origin,title,equipment_name,source_status,priority) SELECT 'preventive:'||n,'x',n,'Preventiva de Equipamento de Cliente','Teste','Equipamento','soon','normal' FROM generate_series(1,3) n;`,
    );
    await assignNewTasks({ query } as any, ["1", "2", "3"]);
    const tasks = (
      await db.query<any>("SELECT id,assigned_to FROM web_tasks ORDER BY id")
    ).rows;
    assert.equal(tasks[0].assigned_to, "a@example.com");
    assert.equal(tasks[1].assigned_to, null);
    assert.equal(tasks[2].assigned_to, null);
    assert.equal(
      (await db.query<any>("SELECT * FROM web_task_notifications")).rows.length,
      1,
    );
    await assignNewTasks({ query } as any, ["1"]);
    assert.equal(
      (await db.query<any>("SELECT * FROM web_task_notifications")).rows.length,
      1,
    );
    const rule = (await territoryList()).rules.find((r) => r.uf === "SC");
    await saveTerritory(
      {
        action: "save",
        id: rule.id,
        version: rule.version,
        city: "São José",
        uf: "SC",
        assignee: "b@example.com",
      },
      "admin@example.com",
    );
    await assert.rejects(
      () =>
        saveTerritory(
          { action: "delete", id: rule.id, version: rule.version },
          "admin@example.com",
        ),
      /Registro alterado/,
    );
    await saveTerritory(
      { action: "delete", id: rule.id, version: rule.version + 1 },
      "admin@example.com",
    );
    assert.equal(
      (await db.query<any>("SELECT assigned_to FROM web_tasks WHERE id=1"))
        .rows[0].assigned_to,
      "a@example.com",
    );
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
