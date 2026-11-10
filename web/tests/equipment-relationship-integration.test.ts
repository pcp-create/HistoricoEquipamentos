import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  equipmentPersonRows,
  synchronizeEquipmentCustomerLink,
  synchronizeEquipmentActivity,
} from "../lib/equipment/relationship-integration";
import {
  equipmentRelationshipStates,
  annotateEquipmentClients,
} from "../lib/equipment/relationship-state";
import { M8RequestError } from "../lib/service-orders/m8";
test("equipment relationship creation and status synchronize safely and confirm the exact ERP association", async () => {
  const pg = new PGlite();
  const query = (sql: string, args?: any[]) =>
    pg.query(sql.replace("BEGIN READ WRITE", "BEGIN"), args);
  const db = { query, connect: async () => ({ query, release() {} }) };
  try {
    await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE web_tasks(id bigint PRIMARY KEY,status text,source_resolved boolean,completed_at timestamptz,updated_at timestamptz,updated_by text,version int DEFAULT 1);
 CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,serial text,present boolean);
 CREATE TABLE m8_person_equipment(company_id int,person_id bigint,link_id bigint,equipment_id bigint,person_name text,equipment_name text,payload jsonb,present boolean,collected_at timestamptz,PRIMARY KEY(company_id,person_id,link_id));
 CREATE TABLE web_visit_machine_registrations(id uuid);
 CREATE TABLE web_visit_equipment_inactivations(customer_key text,equipment_key text,reason text,created_at timestamptz DEFAULT now(),PRIMARY KEY(customer_key,equipment_key));
 CREATE TABLE web_equipment_settings(equipment_id bigint PRIMARY KEY,document jsonb,version int DEFAULT 1,updated_at timestamptz);
 INSERT INTO web_tasks(id,status) VALUES(1,'not_started');`);
    await pg.exec(readFileSync("sql/103_equipment_customer_links.sql", "utf8"));
    await pg.exec(
      readFileSync("sql/105_equipment_relation_integration.sql", "utf8"),
    );
    const link = async (eq: number) => {
      await query(
        "INSERT INTO web_equipment_customer_links(equipment_id,customer_key,customer_name,actor,source,task_id) VALUES($1,'m8:7','Cliente','user','workshop',CASE WHEN $1::bigint=10 THEN 1::bigint END)",
        [eq],
      );
    };
    const remote: any[] = [];
    let posts = 0,
      patches = 0,
      lose = false,
      loseWithoutCreate = false;
    const session =
      async () => async (path: string, body?: any, method?: string) => {
        if (!body) {
          const person = Number(path.match(/pessoa\/(\d+)/)?.[1]);
          return structuredClone(remote.filter((r) => r.pessoaId === person));
        }
        if (method === "PATCH") {
          patches++;
          const row = remote.find((r) => path.endsWith("/" + r.id));
          assert.ok(row);
          assert.ok(["Sim", "Nao"].includes(body.ativo));
          row.ativo = body.ativo === "Sim";
          row.motivoInativacao = body.motivoInativacao;
          return { id: row.id };
        }
        posts++;
        assert.deepEqual(Object.keys(body).sort(), [
          "equipamentoId",
          "pessoaId",
        ]);
        if (!loseWithoutCreate)
          remote.push({
            id: 100 + body.equipamentoId,
            equipamentoId: body.equipamentoId,
            pessoaId: body.pessoaId,
            pessoaNome: "Cliente",
            equipamentoNome: "Compressor",
            ativo: true,
            motivoInativacao: "",
          });
        if (lose || loseWithoutCreate)
          throw new M8RequestError("Resposta perdida", true);
        return { id: 100 + body.equipamentoId };
      };
    await link(10);
    assert.equal(
      (await synchronizeEquipmentCustomerLink(db, "10", "m8:7", session as any))
        .integrationPending,
      false,
    );
    assert.equal(posts, 1);
    assert.equal(
      ((await query("SELECT status FROM web_tasks WHERE id=1")).rows[0] as any)
        .status,
      "completed",
    );
    assert.equal(
      (await synchronizeEquipmentCustomerLink(db, "10", "m8:7", session as any))
        .integrationPending,
      false,
    );
    assert.equal(posts, 1);
    await link(11);
    remote.push({
      id: 111,
      equipamentoId: 11,
      pessoaId: 7,
      ativo: false,
      motivoInativacao: "Vendido",
    });
    assert.equal(
      (await synchronizeEquipmentCustomerLink(db, "11", "m8:7", session as any))
        .integrationPending,
      false,
    );
    assert.equal(posts, 1);
    await link(12);
    lose = true;
    assert.equal(
      (await synchronizeEquipmentCustomerLink(db, "12", "m8:7", session as any))
        .integrationPending,
      true,
    );
    assert.equal(posts, 2);
    lose = false;
    assert.equal(
      (await synchronizeEquipmentCustomerLink(db, "12", "m8:7", session as any))
        .integrationPending,
      false,
    );
    assert.equal(posts, 2);
    await link(13);
    loseWithoutCreate = true;
    await synchronizeEquipmentCustomerLink(db, "13", "m8:7", session as any);
    assert.equal(posts, 3);
    loseWithoutCreate = false;
    assert.equal(
      (await synchronizeEquipmentCustomerLink(db, "13", "m8:7", session as any))
        .integrationPending,
      true,
    );
    assert.equal(posts, 3);
    assert.equal(
      (
        await synchronizeEquipmentCustomerLink(
          db,
          "10",
          "lead:00000000-0000-4000-8000-000000000000",
          session as any,
        )
      ).integrationPending,
      true,
    );
    assert.equal(posts, 3);
    await query("INSERT INTO web_equipment_settings VALUES(10,$1,1,now())", [
      JSON.stringify({
        inactivation: { reason: "Desativado no portal", erpStatus: "not_sent" },
        erpActivity: { active: false, reason: "Desativado no portal" },
      }),
    ]);
    assert.equal(
      (await synchronizeEquipmentActivity(db, "10", undefined, session as any))
        .integrationPending,
      false,
    );
    assert.equal(patches, 1);
    assert.equal(remote.find((r) => r.id === 110).ativo, false);
    assert.equal(
      remote.find((r) => r.id === 110).motivoInativacao,
      "Desativado no portal",
    );
    await synchronizeEquipmentActivity(db, "10", undefined, session as any);
    assert.equal(patches, 1);
    let states = await equipmentRelationshipStates(db, ["10", "11"]);
    assert.equal(states.get("10")?.inactivation.reason, "Desativado no portal");
    assert.equal(states.get("11")?.inactivation.reason, "Vendido");
    await query(
      "INSERT INTO m8_person_equipment VALUES(1,8,118,11,'Outro cliente','Compressor',$1,true,now())",
      [JSON.stringify({ ativo: true, motivoInativacao: "" })],
    );
    states = await equipmentRelationshipStates(db, ["11"]);
    assert.equal(states.get("11")?.inactivation, null);
    const clients = annotateEquipmentClients(
      [{ id: "7" }, { id: "8" }],
      states.get("11"),
    );
    assert.equal(clients[0].inactivation.reason, "Vendido");
    assert.equal(clients[1].inactivation, null);
    assert.throws(
      () =>
        equipmentPersonRows(
          [{ id: 1, equipamentoId: 10, pessoaId: 8, ativo: false }],
          "7",
        ),
      /inválido/,
    );
    assert.throws(
      () =>
        equipmentPersonRows(
          [{ id: 1, equipamentoId: 10, pessoaId: 7, ativo: "false" }],
          "7",
        ),
      /inválido/,
    );
    assert.equal(
      equipmentPersonRows(
        [
          {
            id: 1,
            equipamentoId: 10,
            pessoaId: 7,
            ativo: false,
            motivoInativacao: "Vendido",
          },
        ],
        "7",
      )[0].ativo,
      false,
    );
  } finally {
    await pg.close();
  }
});
