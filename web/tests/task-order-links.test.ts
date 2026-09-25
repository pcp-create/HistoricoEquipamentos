import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createTask, updateTask } from "../lib/tasks/store";
import { creationContext } from "../lib/tasks/creation-context";
test("manual tasks persist verified OS/company/equipment links and preserve manual lifecycle", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  const query = db.query.bind(db);
  g.historyPool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
    for (const f of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "011_task_kanban",
      "012_manual_tasks",
      "016_task_order_links",
    ])
      await db.exec(
        readFileSync(new URL("../sql/" + f + ".sql", import.meta.url), "utf8"),
      );
    await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text);
 CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,present boolean);
 CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean);
 CREATE TABLE m8_person_equipment(equipment_id bigint,person_name text,present boolean);
 INSERT INTO m8_ordens_servico VALUES(1,100,42,'Cliente A','Compressor A'),(2,100,42,'Cliente B','Compressor B');
 INSERT INTO m8_equipment_catalog VALUES(7,'Compressor A',true),(8,'Compressor B',true);
 INSERT INTO m8_order_equipment_links VALUES(1,100,7,false),(2,100,8,false);
 INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('a@example.com','Pessoa','5547999999999','test');`);
    const user = { id: "u", email: "a@example.com" },
      body = {
        title: "Acompanhar OS",
        description: "Conferir retorno",
        priority: "normal",
        assignedTo: "a@example.com",
        dueDate: "2026-10-01",
        orderCompany: 2,
        orderId: "100",
        equipmentId: "8",
      };
    const created = await createTask(body, user);
    assert.equal(String(created.task.order_id), "100");
    assert.equal(created.task.order_company, 2);
    assert.equal(created.task.order_number, "42");
    assert.equal(created.task.customer, "Cliente B");
    assert.equal(String(created.task.equipment_id), "8");
    assert.equal(created.notifications.length, 1);
    assert.match(created.task.source_key, /^manual:/);
    await assert.rejects(
      () => createTask({ ...body, equipmentId: "7" }, user),
      /não vinculado/,
    );
    await assert.rejects(
      () => createTask({ ...body, orderCompany: 27404 }, user),
      /não encontrada/,
    );
    const c = await creationContext({ query } as any, {
      orderId: "100",
      orderCompany: 1,
    });
    assert.equal(c.equipment.id, "7");
    const onlyOrder = await createTask(
      { ...body, equipmentId: "", assignedTo: "" },
      user,
    );
    assert.equal(onlyOrder.task.equipment_id, null);
    const standalone = await createTask(
      {
        ...body,
        orderId: undefined,
        orderCompany: undefined,
        equipmentId: "7",
      },
      user,
    );
    assert.equal(standalone.task.origin, "Equipamento");
    assert.equal(standalone.task.order_id, null);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
