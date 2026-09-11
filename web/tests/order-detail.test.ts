import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { orderDetail } from "../lib/history";
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
    globals.historyPool = db;
    const result = await orderDetail("1", "1");
    assert.equal(result.services.length, 1);
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
