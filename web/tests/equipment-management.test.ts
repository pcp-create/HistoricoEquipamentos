import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  saveEquipment,
  equipmentDetail,
  equipmentList,
  EquipmentConflict,
} from "../lib/equipment-management/store";
import { emptyOperating } from "../lib/equipment-management/planning";
test("equipment plans persist independently of M8, enforce scope/concurrency and keep intervention audit", async () => {
  const db = new PGlite(),
    global = globalThis as any,
    old = global.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const f of readdirSync(
      new URL("../../supabase/migrations/", import.meta.url),
    )
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/" + f, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      readFileSync(
        new URL("../sql/007_equipment_preventive.sql", import.meta.url),
        "utf8",
      ),
    );
    const query = db.query.bind(db);
    global.historyPool = {
      query,
      connect: async () => ({ query, release() {} }),
    };
    await db.exec(`INSERT INTO m8_equipment_catalog(company_id,equipment_id,name,model,payload,collected_at) VALUES(1,100,'GA 90','GA90','{}',now()),(1,200,'W800','W800','{}',now());
 INSERT INTO m8_person_equipment(company_id,person_id,link_id,equipment_id,person_name,payload,collected_at) VALUES(1,10,1,100,'Cliente A','{}',now()),(2,10,2,100,'Cliente A','{}',now());`);
    const user = {
      id: "user",
      email: "test@example.com",
      user_metadata: { name: "Equipe" },
    };
    await saveEquipment(
      {
        equipment: "100",
        action: "settings",
        version: null,
        document: {
          ...emptyOperating,
          hoursDay: 24,
          daysYear: 365,
          ownership: "customer",
        },
      },
      user,
    );
    const base = {
      name: "Preventiva 4000",
      hours: 4000,
      months: 6,
      lastDate: "2026-01-01",
      lastMeter: 1000,
      lastOrder: "",
      notes: "",
    };
    await saveEquipment(
      { equipment: "100", action: "plan", version: null, document: base },
      user,
    );
    await saveEquipment(
      {
        equipment: "100",
        action: "plan",
        version: null,
        document: { ...base, name: "Preventiva 8000", hours: 8000 },
      },
      user,
    );
    let detail = await equipmentDetail("100");
    assert.equal(detail.clients.length, 1);
    assert.equal(detail.plans.length, 2);
    const plan = detail.plans.find((p: any) => p.document.hours === 4000);
    await assert.rejects(() =>
      saveEquipment(
        {
          equipment: "200",
          action: "maintenance",
          id: plan.id,
          version: plan.version,
          document: { date: "2026-02-01", meter: 5100, notes: "", order: "" },
        },
        user,
      ),
    );
    await saveEquipment(
      {
        equipment: "100",
        action: "maintenance",
        id: plan.id,
        version: plan.version,
        document: {
          date: "2026-02-01",
          meter: 5100,
          notes: "Troca registrada",
          order: "",
        },
      },
      user,
    );
    detail = await equipmentDetail("100");
    const updated = detail.plans.find((p: any) => p.id === plan.id);
    assert.equal(updated.forecast.target, 9100);
    assert.equal(
      detail.plans.find((p: any) => p.id !== plan.id).document.lastMeter,
      1000,
    );
    assert.ok(
      detail.events.some(
        (e: any) =>
          e.kind === "maintenance" &&
          e.display_name === "Equipe" &&
          e.document.intervention.notes === "Troca registrada",
      ),
    );
    await assert.rejects(
      () =>
        saveEquipment(
          {
            equipment: "100",
            action: "plan",
            id: plan.id,
            version: 1,
            document: base,
          },
          user,
        ),
      EquipmentConflict,
    );
    await assert.rejects(() =>
      saveEquipment(
        {
          equipment: "100",
          action: "maintenance",
          id: plan.id,
          version: updated.version,
          document: { date: "2026-03-01", meter: 20, notes: "", order: "" },
        },
        user,
      ),
    );
    await db.exec(
      "UPDATE m8_equipment_catalog SET name='Novo nome' WHERE equipment_id=100",
    );
    assert.equal((await equipmentDetail("100")).plans.length, 2);
    const list = await equipmentList(new URLSearchParams("q=cliente+a"));
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].plans, 2);
    await saveEquipment(
      {
        equipment: "100",
        action: "archive",
        id: plan.id,
        version: updated.version,
      },
      user,
    );
    assert.equal((await equipmentDetail("100")).plans.length, 1);
    await db.exec(
      `UPDATE m8_equipment_catalog SET payload='{"familiaId":3}' WHERE equipment_id=100`,
    );
    await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,collected_at,payload) VALUES
      (1,100,now(),'{}'),(2,100,now(),' {"codigoIdentificacaoInterno":"LOC-007"}');`);
    assert.equal(
      (await equipmentDetail("100")).equipment.internal_code,
      "LOC-007",
    );
    assert.equal(
      (await equipmentList(new URLSearchParams("q=LOC-007"))).total,
      1,
    );
    await db.exec(
      `UPDATE m8_equipment_catalog SET payload=payload || '{"codigoIdentificacaoInterno":"EQ-008"}' WHERE equipment_id=100`,
    );
    assert.equal(
      (await equipmentList(new URLSearchParams("rental=1"))).rows[0]
        .internal_code,
      "EQ-008",
    );
    assert.equal((await equipmentDetail("200")).equipment.internal_code, null);
    const rentals = await equipmentList(new URLSearchParams("rental=1"));
    assert.equal(rentals.total, 1);
    assert.equal(rentals.rows[0].id, "100");
    assert.equal(rentals.rows[0].ownership, "own");
    assert.equal((await equipmentDetail("100")).equipment.rental, true);
    assert.equal(
      (await equipmentList(new URLSearchParams("ownership=own"))).total,
      1,
    );
    assert.equal((await equipmentDetail("200")).equipment.rental, false);
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,status,emissao,payload) VALUES
      (1,501,'Processado','2026-01-01','{}'),(2,502,'Pendente','2026-02-01','{}'),
      (1,503,'Cancelado','2026-03-01','{}'),(1,504,'Pendente','2026-04-01','{}');
      INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,aprovado,payload) VALUES
      (1,501,501,100,true,'{}'),(2,502,502,100,true,'{}'),
      (1,503,503,100,true,'{}'),(1,504,504,100,false,'{}');
      INSERT INTO m8_order_equipment_links(company_id,order_id,equipment_id,method,evidence) VALUES(1,504,100,'explicit','{}');`);
    const lastOrder = (await equipmentList(new URLSearchParams("q=EQ-008")))
      .rows[0].latest;
    assert.equal(lastOrder.order_id, "502");
    assert.equal(lastOrder.company_id, 2);
    assert.equal(lastOrder.status, "Pendente");
    await db.exec(
      "UPDATE m8_ordens_servico SET tipo_id=45,cliente_nome='Hospital São Clara' WHERE company_id=2 AND id_m8=502",
    );
    const byCustomer = await equipmentList(
      new URLSearchParams("q=hospital+sao+clara&rental=1&all=1"),
    );
    assert.equal(byCustomer.total, 1);
    assert.equal(byCustomer.counts.equipment, 1);
    assert.equal(byCustomer.rows[0].id, "100");
    assert.equal(byCustomer.rows[0].rentalStatus.key, "loaned");
    assert.equal(
      (await equipmentList(new URLSearchParams("q=emprestado&rental=1"))).total,
      1,
    );
    assert.equal(
      (
        await equipmentList(
          new URLSearchParams("q=cliente+inexistente&rental=1"),
        )
      ).total,
      0,
    );
    await db.exec(
      "UPDATE m8_ordens_servico SET tipo_id=8 WHERE company_id=2 AND id_m8=502",
    );
    assert.equal(
      (await equipmentList(new URLSearchParams("q=hospital+sao+clara&all=1")))
        .rows[0].rentalStatus.key,
      "rented",
    );
  } finally {
    global.historyPool = old;
    await db.close();
  }
});
