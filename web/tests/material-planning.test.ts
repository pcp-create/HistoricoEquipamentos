import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  parseAnalysis,
  planMaterial,
  summarizeMaterials,
  type Consumption,
  type Coverage,
} from "../lib/material-planning";
import { analysisQueries } from "../lib/material-analysis";
const now = new Date("2026-07-01T12:00:00Z");
const filters = () =>
  parseAnalysis(
    new URLSearchParams(
      "from=2026-06-01&to=2026-06-30&lead=7&safety=7&review=30",
    ),
    now,
  );
const row: Consumption = {
  company_id: 1,
  product_id: "7",
  unit_key: "UN",
  unit: "UN",
  name: "Filtro",
  reference: "ABC",
  quantity: 30,
  orders: 5,
  active_days: 4,
  first_used: "2026-06-01",
  last_used: "2026-06-20",
};
const coverage: Coverage = {
  company_id: 1,
  eligible: 5,
  complete: 5,
  ignored_items: 0,
  undated: 0,
};
test("planning includes zero-demand days and shows exact, disclosed min-max assumptions", () => {
  const f = filters(),
    r = planMaterial(row, f, coverage);
  assert.equal(f.days, 30);
  assert.equal(r.daily, 1);
  assert.equal(r.monthly, 30);
  assert.equal(r.minimum, 14);
  assert.equal(r.maximum, 44);
  const fractional = planMaterial(
    { ...row, quantity: 1, unit: "L" },
    f,
    coverage,
  );
  assert.equal(fractional.minimum, 0.47);
  assert.equal(fractional.maximum, 1.47);
  const pieces = planMaterial({ ...row, quantity: 1 }, f, coverage);
  assert.equal(pieces.minimum, 1);
  assert.equal(pieces.maximum, 2);
  assert.equal(parseAnalysis(new URLSearchParams(), now).lead, 7);
});
test("partial imports, undated OS, invalid items, unknown units and thin samples block suggestions", () => {
  for (const c of [
    { ...coverage, complete: 4 },
    { ...coverage, undated: 1 },
    { ...coverage, ignored_items: 1 },
  ])
    assert.equal(planMaterial(row, filters(), c).minimum, null);
  assert.equal(
    planMaterial({ ...row, unit: null }, filters(), coverage).minimum,
    null,
  );
  assert.equal(
    planMaterial({ ...row, active_days: 1 }, filters(), coverage).minimum,
    null,
  );
  assert.equal(
    planMaterial({ ...row, orders: 2 }, filters(), coverage).minimum,
    null,
  );
  assert.equal(
    planMaterial(row, { ...filters(), days: 10 }, coverage).minimum,
    null,
  );
});
test("rankings keep company/unit identities, search all material metadata and validate dates", () => {
  const data = [
    row,
    { ...row, company_id: 2, quantity: 90, orders: 2 },
    { ...row, unit: "L", unit_key: "L", quantity: 3000, orders: 3 },
  ];
  const result = summarizeMaterials(
    data,
    [coverage, { ...coverage, company_id: 2 }],
    filters(),
  );
  assert.equal(result.planned.length, 3);
  assert.equal(result.topFrequency[0].orders, 5);
  assert.equal(result.topQuantity.length, 0);
  const qty = summarizeMaterials(data, [coverage], {
    ...filters(),
    unit: "UN",
    sort: "quantity",
  });
  assert.equal(qty.planned.length, 2);
  assert.equal(qty.planned[0].quantity, 90);
  assert.equal(
    summarizeMaterials(data, [coverage], { ...filters(), q: "filtro ABC" })
      .planned.length,
    3,
  );
  for (const q of [
    "sort=quantity",
    "from=2026-07-01&to=2026-07-01",
    "lead=-1",
    "review=0",
    "company=999",
    "from=2026-02-30",
  ])
    assert.throws(() => parseAnalysis(new URLSearchParams(q), now));
});
test("SQL counts each OS once, excludes open/cancelled/incomplete/deleted items, separates units and companies", async () => {
  const db = new PGlite();
  try {
    for (const name of [
      "001_m8_history.sql",
      "002_m8_observed_types.sql",
      "003_m8_id_scan.sql",
      "004_m8_approval_mixed.sql",
      "005_m8_collection_cycle.sql",
    ])
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,status,emissao,payload) VALUES
 (1,1,'Processado','2026-06-01T12:00:00Z','{}'),(1,2,'Pendente','2026-06-02T12:00:00Z','{}'),(1,3,'Cancelado','2026-06-03T12:00:00Z','{}'),(1,4,'Processado','2026-06-04T12:00:00Z','{}'),(2,1,'Processado','2026-06-05T12:00:00Z','{}'),(1,5,'Processado','2026-07-01T02:00:00Z','{}'),(1,6,'Processado','2026-07-01T04:00:00Z','{}'),(2,2,'Processado',null,'{}');
 INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,pending,finalized) SELECT company_id,id_m8,now(),(id_m8=4),(id_m8<>4) FROM m8_ordens_servico;
 INSERT INTO m8_os_produtos(company_id,ordem_servico_id,id_m8,produto_id,produto_nome,unidade_nome,quantidade,esta_excluido,payload) VALUES
 (1,1,1,7,'Filtro','UN',2,false,'{}'),(1,1,2,7,'Filtro','un',3,false,'{}'),(1,1,3,7,'Filtro','L',10,false,'{}'),(1,1,4,8,'Excluído','UN',999,true,'{}'),(1,2,1,7,'Aberto','UN',900,false,'{}'),(1,3,1,7,'Cancelado','UN',800,false,'{}'),(1,4,1,7,'Incompleto','UN',700,false,'{}'),(2,1,1,7,'Outra empresa','UN',20,false,'{}'),(1,5,1,7,'Filtro','UN',4,false,'{}'),(1,6,1,7,'Fora período','UN',600,false,'{}');`);
    const query = analysisQueries(filters());
    const result = await db.query<Consumption>(query.consumption, query.values),
      c = await db.query<Coverage>(query.coverage, query.values);
    assert.equal(result.rows.length, 3);
    const un = result.rows.find((r) => r.company_id === 1 && r.unit === "UN")!;
    assert.equal(un.quantity, 9);
    assert.equal(un.orders, 2);
    assert.equal(un.active_days, 2);
    assert.equal(un.last_used, "2026-06-30");
    assert.equal(result.rows.find((r) => r.company_id === 2)!.quantity, 20);
    assert.equal(c.rows.find((r) => r.company_id === 1)!.eligible, 3);
    assert.equal(c.rows.find((r) => r.company_id === 1)!.complete, 2);
    assert.equal(c.rows.find((r) => r.company_id === 2)!.undated, 1);
    await db.exec(
      "INSERT INTO m8_os_produtos(company_id,ordem_servico_id,id_m8,produto_id,quantidade,payload) VALUES(1,1,10,7,-2,'{}'),(1,1,11,null,4,'{}')",
    );
    const c2 = await db.query<Coverage>(query.coverage, query.values);
    assert.equal(c2.rows.find((r) => r.company_id === 1)!.ignored_items, 2);
    const scoped = analysisQueries({ ...filters(), company: "2" });
    const only2 = await db.query<Consumption>(
      scoped.consumption,
      scoped.values,
    );
    assert.equal(only2.rows.length, 1);
    assert.equal(only2.rows[0].company_id, 2);
  } finally {
    await db.close();
  }
});
