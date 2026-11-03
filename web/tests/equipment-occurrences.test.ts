import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  createOccurrence,
  createOperationOccurrence,
  operationOccurrenceEquipment,
  occurrencesForEquipment,
  occurrenceInput,
} from "../lib/equipment-occurrences/store";
test("occurrences follow the equipment without mixing machines and preserve full details", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,name text,serial text,present boolean);CREATE TABLE web_user_access(email text PRIMARY KEY,display_name text);INSERT INTO m8_equipment_catalog VALUES(100,'Compressor A','A001',true),(200,'Compressor B','B001',true),(300,'Antigo','C001',false);INSERT INTO web_user_access VALUES('planner','Planejador');`,
    );
    assert.deepEqual(await occurrencesForEquipment(db, ["100"]), []);
    const migration = readFileSync(
      new URL("../sql/094_equipment_occurrences.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const description =
      "Vazamento na conexão.\nConferir antes do atendimento. " +
      "Referência técnica. ".repeat(30);
    const first = await createOccurrence(
      db,
      {
        equipmentId: "100",
        occurredOn: "2026-10-01",
        title: "Vazamento",
        description,
      },
      "planner",
    );
    await createOccurrence(
      db,
      {
        equipmentId: "100",
        occurredOn: "2026-11-03",
        title: "Ruído intermitente",
        description: "Observar em carga.",
      },
      "planner",
    );
    await createOccurrence(
      db,
      {
        equipmentId: "200",
        occurredOn: "2026-11-03",
        title: "Outro equipamento",
        description: "Não exibir para A.",
      },
      "planner",
    );
    const rows = await occurrencesForEquipment(db, ["100"]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, "Ruído intermitente");
    assert.equal(rows[1].id, first.id);
    assert.equal(rows[1].description, description.trim());
    assert.equal(rows[1].author, "Planejador");
    assert.equal(rows[1].occurred_on, "2026-10-01");
    await db.query(
      "UPDATE m8_equipment_catalog SET present=false WHERE equipment_id=100",
    );
    assert.deepEqual(await occurrencesForEquipment(db, ["100"]), rows);
    assert.equal(
      (await occurrencesForEquipment(db, ["200"]))[0].title,
      "Outro equipamento",
    );
    await assert.rejects(
      () =>
        createOccurrence(
          db,
          {
            equipmentId: "300",
            occurredOn: "2026-11-03",
            title: "X",
            description: "Y",
          },
          "planner",
        ),
      /não está disponível/,
    );
    for (const patch of [
      { equipmentId: "100 OR 1=1" },
      { occurredOn: "2026-02-30" },
      { title: " " },
      { description: " " },
      { description: "x".repeat(12001) },
    ])
      assert.throws(() =>
        occurrenceInput({
          equipmentId: "100",
          occurredOn: "2026-11-03",
          title: "Título",
          description: "Descrição",
          ...patch,
        }),
      );
    await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,produto_equipamento_id bigint);CREATE TABLE web_service_schedules(id bigint PRIMARY KEY,company_id int,order_id bigint,active boolean);CREATE TABLE web_service_operations(id uuid PRIMARY KEY,schedule_id bigint,document jsonb,sent_at timestamptz);CREATE TABLE m8_order_equipment_links(equipment_id bigint,company_id int,order_id bigint,stale boolean);UPDATE m8_equipment_catalog SET present=true WHERE equipment_id=100;INSERT INTO web_service_schedules VALUES(1,1,1000,true);INSERT INTO web_service_operations VALUES('11111111-1111-4111-8111-111111111111',1,'{"equipmentId":"100","responsible":"tech","support":["helper"]}',now());INSERT INTO m8_order_equipment_links VALUES(200,1,1000,false);`);
    const opId='11111111-1111-4111-8111-111111111111';
    const b={operationId:opId,equipmentId:'100',occurredOn:'2026-11-03',title:'B.O do técnico',description:'Particularidade identificada em campo.'};
    await createOperationOccurrence(db,b,'tech');
    assert.equal((await operationOccurrenceEquipment(db,opId,'helper'))[0].id,'100');
    await assert.rejects(()=>createOperationOccurrence(db,b,'outsider'),/não está disponível/);
    await assert.rejects(()=>createOperationOccurrence(db,{...b,equipmentId:'200'},'tech'),/vinculado/);
    await db.query(`UPDATE web_service_operations SET document=document-'equipmentId' WHERE id=$1`,[opId]);
    assert.equal((await operationOccurrenceEquipment(db,opId,'tech'))[0].id,'200');
    // OS 15211: the ERP equipment exists, but the auxiliary links are not collected.
    await db.query('DELETE FROM m8_order_equipment_links');
    await db.query('INSERT INTO m8_ordens_servico VALUES(1,1000,100)');
    assert.equal((await operationOccurrenceEquipment(db,opId,'tech'))[0].id,'100');
    await createOperationOccurrence(db,b,'tech');
    await db.query('UPDATE web_service_schedules SET active=false');
    await assert.rejects(()=>createOperationOccurrence(db,b,'tech'),/não está disponível/);
  } finally {
    await db.close();
  }
});
