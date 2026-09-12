import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { productLookup } from "../lib/product-lookup";
import { orderDetail } from "../lib/history";
import {
  orderLaborHours,
  estimatedMaterialCost,
  estimatedProfit,
} from "../lib/order-profit";
import { orderTotals } from "../lib/order-totals";

test("OS totals use recorded item totals, exclude deleted materials and disclose incomplete values", () => {
  const materials = [
    { quantidade: 2, valor_unitario: 1201.0001, valor_total: "2402" },
    { valor_total: 999, esta_excluido: true },
  ];
  assert.deepEqual(
    orderTotals(materials, [{ valor_total: "100.25" }], "2502.25", true),
    { materials: 2402, services: 100.25, combined: 2502.25, difference: 0 },
  );
  assert.equal(orderTotals(materials, [], "2400", true).difference, -2);
  assert.equal(
    orderTotals([{ valor_total: null }], [], 0, true).combined,
    null,
  );
  assert.equal(orderTotals([], [], 0, false).combined, null);
  assert.equal(
    orderTotals([{ valor_total: "invalid" }], [], 0, true).combined,
    null,
  );
  assert.equal(orderTotals([], [], 0, true).combined, 0);
  assert.equal(
    orderTotals([{ valor_total: 0.1 }, { valor_total: 0.2 }], [], 0.3, true)
      .difference,
    0,
  );
});

test("OS detail returns services from the selected company and order without raw payload", async () => {
  const db = new PGlite();
  const globals = globalThis as unknown as { historyPool: unknown };
  const previous = globals.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
    for (const name of readdirSync(
      new URL("../../supabase/migrations/", import.meta.url),
    )
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,payload) VALUES (1,1,'{}'),(2,1,'{}'),(1,2,'{}');
      INSERT INTO m8_os_servicos(company_id,id_m8,ordem_servico_id,servico_id,servico_nome,quantidade,valor_unitario,valor_total,payload)
      VALUES (1,1,1,10,'Revisão',2,100,200,'{"private":"hidden"}'),
      (2,1,1,20,'Outra empresa',1,50,50,'{}'),(1,2,2,30,'Outra OS',1,80,80,'{}');`);
    await db.exec(`INSERT INTO m8_service_catalog(company_id,service_id,name,unit,collected_at,payload) VALUES(1,10,'Revisão','H',now(),'{}');
      INSERT INTO m8_product_catalog(company_id,product_id,name,unit,collected_at,payload) VALUES(1,5,'Filtro','UN',now(),'{}');
      INSERT INTO m8_product_stock(company_id,product_id,establishment_id,stock,average_cost,collected_at,payload) VALUES(1,5,1,0,30,now(),'{}');
      INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,quantidade,unidade_nome,payload) VALUES(1,1,1,5,2,'UN','{}');`);
    globals.historyPool = db;
    await db.exec(`UPDATE m8_ordens_servico SET status='Processado',numero_sequencia=14083,emissao='2026-09-10' WHERE company_id=1 AND id_m8=1;
      INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,finalized,pending) VALUES(1,1,now(),true,false);`);
    const lookup = await productLookup("5");
    assert.equal(lookup.length, 1);
    assert.equal(lookup[0].last_order_number, "14083");
    assert.equal(Number(lookup[0].average_cost), 30);
    assert.equal(Number(lookup[0].stock), 0);
    assert.equal(lookup[0].available, null);
    assert.deepEqual(await productLookup("999"), []);
    await assert.rejects(() => productLookup("5 OR 1=1"));
    const result = await orderDetail("1", "1");
    assert.equal(result.services.length, 1);
    assert.equal(result.services[0].service_unit, "H");
    assert.equal(Number(result.materials[0].current_average_cost), 30);
    assert.equal(orderLaborHours(result.services, true), 2);
    assert.equal(result.services[0].servico_nome, "Revisão");
    assert.equal(Number(result.services[0].valor_total), 200);
    assert.equal(result.services[0].payload, undefined);
    assert.equal(
      (await orderDetail("1", "2")).services[0].servico_nome,
      "Outra OS",
    );
    assert.equal(await orderDetail("3", "1"), null);
    assert.equal(await orderDetail("1", "999"), null);
  } finally {
    globals.historyPool = previous;
    await db.close();
  }
});

test("gross estimate excludes removed items, checks cost coverage and does not zero missing services", () => {
  const material = {
    quantidade: 2,
    current_average_cost: "30",
    unidade_nome: "UN",
    current: { unit: "UN", stock: "10", stock_value: "300" },
  };
  assert.equal(
    estimatedMaterialCost([material, { esta_excluido: true }], true).amount,
    60,
  );
  assert.equal(estimatedMaterialCost([material], false).amount, null);
  assert.equal(
    estimatedMaterialCost([{ ...material, unidade_nome: "CX" }], true).amount,
    null,
  );
  assert.equal(
    estimatedMaterialCost(
      [{ ...material, current: { unit: "UN", stock: "0", stock_value: "0" } }],
      true,
    ).amount,
    60,
  );
  assert.equal(estimatedProfit(200, "60", ""), null);
  assert.deepEqual(estimatedProfit(200, "60", "40"), {
    cost: 100,
    profit: 100,
    margin: 50,
  });
  assert.equal(estimatedProfit(50, "60", "40")?.profit, -50);
  assert.equal(estimatedProfit(0, "0", "0")?.margin, null);
});

test("labor costs use hours and do not mistake units for hours", () => {
  assert.equal(
    orderLaborHours(
      [
        { service_unit: "H", quantidade: 2.5 },
        { service_unit: "HORAS", quantidade: 1 },
      ],
      true,
    ),
    3.5,
  );
  assert.equal(
    orderLaborHours([{ service_unit: "UN", quantidade: 2 }], true),
    null,
  );
  assert.equal(orderLaborHours([], false), null);
  assert.equal(orderLaborHours([], true), 0);
});

test("OS 14611 rejects Nao/false items and keeps unknown approval without treating it as rejected", () => {
  const materials = [
    { aprovado: "Nao", valor_total: 466.8 },
    { aprovado: "Nao", valor_total: 466.8 },
    { aprovado: false, valor_total: 466.8 },
    { aprovado: "Sim", esta_excluido: true, valor_total: 466.8 },
    { aprovado: "Sim", valor_total: 994 },
    { aprovado: true, valor_total: 873.2 },
  ];
  assert.equal(orderTotals(materials, [], 1867.2, true).materials, 1867.2);
  assert.equal(orderTotals(materials, [], 1867.2, true).difference, 0);
  assert.equal(
    orderTotals([{ aprovado: null, valor_total: 10 }], [], 10, true).materials,
    10,
  );
  assert.equal(estimatedMaterialCost([{ aprovado: "Nao" }], true).amount, 0);
});
