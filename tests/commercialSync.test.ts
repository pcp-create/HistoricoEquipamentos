import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { catalogPages } from "../src/sync/catalogPages.js";
import { syncCustomerCommercial } from "../src/sync/customerCommercial.js";
import { syncCommercialFacts } from "../src/sync/commercialFacts.js";
async function fixture() {
  const db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
  for (const name of readdirSync(
    new URL("../supabase/migrations/", import.meta.url),
  )
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  return db;
}
test("pagination validates errors, repeated pages and interruption", async () => {
  const page = Array.from({ length: 500 }, (_, i) => ({ id: i + 1 }));
  assert.equal(
    (
      await catalogPages(
        {
          get: async (_, p) => ({ data: p.Page === 1 ? page : [{ id: 501 }] }),
        },
        "/test",
      )
    ).length,
    501,
  );
  await assert.rejects(
    () => catalogPages({ get: async () => ({ data: page }) }, "/test"),
    /repetido/,
  );
  await assert.rejects(() =>
    catalogPages(
      { get: async () => ({ data: [], errors: ["failed"] }) },
      "/test",
    ),
  );
  await assert.rejects(
    () =>
      catalogPages({ get: async () => ({ data: [] }) }, "/test", () => true),
    /interrompida/,
  );
});
test("shared customer sync discovers clients, refreshes vendors and preserves snapshots on failures", async () => {
  const db = await fixture();
  let broken = false,
    vendors = [{ id: 10, vendedorId: 5, vendedorNome: "Ana" }];
  const client = {
    company: 1,
    get: async (path: string) => ({
      data: path.endsWith("/vendedor")
        ? broken
          ? null
          : vendors
        : path.endsWith("/7")
          ? {
              cpfCnpj: "12345678901",
              razaoSocial: "Cliente",
              classificacaoNome: "Indústria",
            }
          : [{ id: 7, razaoSocial: "Cliente" }],
    }),
  };
  try {
    assert.equal((await syncCustomerCommercial(client, db)).checked, 1);
    assert.equal(
      (await db.query("SELECT * FROM m8_customer_directory")).rows.length,
      1,
    );
    assert.equal(
      (await db.query<any>("SELECT sellers FROM m8_customer_commercial"))
        .rows[0].sellers[0].vendedorNome,
      "Ana",
    );
    broken = true;
    await db.exec("UPDATE m8_customer_commercial_queue SET next_at=now()");
    assert.equal((await syncCustomerCommercial(client, db)).failures, 1);
    assert.equal(
      (await db.query<any>("SELECT sellers FROM m8_customer_commercial"))
        .rows[0].sellers.length,
      1,
    );
    broken = false;
    vendors = [];
    await db.exec("UPDATE m8_customer_commercial_queue SET next_at=now()");
    await syncCustomerCommercial(client, db);
    assert.deepEqual(
      (await db.query<any>("SELECT sellers FROM m8_customer_commercial"))
        .rows[0].sellers,
      [],
    );
    await assert.rejects(
      () => syncCustomerCommercial({ ...client, company: 2 }, db),
      /compartilhados/,
    );
  } finally {
    await db.close();
  }
});
test("PBIX facts reconcile status, filters, monthly contracts and failed responses atomically", async () => {
  const db = await fixture();
  const sync = (
    kind: Parameters<typeof syncCommercialFacts>[2],
    rows: unknown[],
    company = 1,
  ) =>
    syncCommercialFacts(
      { company, get: async () => ({ data: rows }) },
      db,
      kind,
    );
  try {
    const invoice = {
      id: 5,
      emissao: "2026-10-26T23:00:00-03:00",
      totalGeral: 123.45,
      status: "Processado",
      pessoaNome: "Cliente",
    };
    await sync("fFaturamento", [invoice]);
    await sync("fFaturamento", [invoice], 2);
    const facts = await db.query<any>('SELECT * FROM "fFaturamento"');
    assert.equal(facts.rows.length, 1);
    assert.equal(facts.rows[0].company_id, 1);
    assert.equal(facts.rows[0].pessoaNome, "Cliente");
    assert.equal(facts.rows[0]["totalGeral"], "123.45");
    assert.equal(facts.rows[0]["Mes/ano Emissao"], "10/2026");
    await sync("fDevolucoesCompra", [
      { ...invoice, tipoCompraDescricao: "DEVOLUÇÃO" },
      { ...invoice, id: 6, tipoCompraDescricao: "COMPRA" },
    ]);
    assert.equal(
      (await db.query('SELECT * FROM "fDevolucoesCompra"')).rows.length,
      1,
    );
    await sync("fDevolucoesOutros", [
      { ...invoice, outrosDocumentosOperacaoId: 30 },
      { ...invoice, id: 6, outrosDocumentosOperacaoId: 31 },
      {
        ...invoice,
        id: 7,
        status: "Cancelado",
        outrosDocumentosOperacaoId: 82,
      },
    ]);
    assert.equal(
      (await db.query('SELECT * FROM "fDevolucoesOutros"')).rows.length,
      1,
    );
    await sync("fContratos", [
      {
        id: 1,
        inicio: "2026-01-31",
        final: "2026-03-01",
        valor: 300,
        tipoContratoNome: "1 - Manutenção",
      },
    ]);
    const months = (
      await db.query<any>('SELECT * FROM "fContratos" ORDER BY "Competência"')
    ).rows;
    assert.equal(months.length, 3);
    assert.equal(Number(months[0]["Valor Parcela"]), 100);
    assert.equal(months[2]["Parcela Atual/Total"], "3/3");
    assert.equal(months[0]["Tipo de Contrato"], "Manutenção");
    await assert.rejects(() =>
      syncCommercialFacts(
        { company: 1, get: async () => ({ data: null }) },
        db,
        "fFaturamento",
      ),
    );
    assert.equal(
      (await db.query('SELECT * FROM "fFaturamento"')).rows.length,
      1,
    );
    await sync("fFaturamento", [{ ...invoice, status: "Cancelado" }], 1);
    await sync("fFaturamento", [], 2);
    assert.equal(
      (await db.query('SELECT * FROM "fFaturamento"')).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM m8_commercial_facts WHERE kind='fFaturamento'",
        )
      ).rows.length,
      2,
    );
    await assert.rejects(() => sync("fContratos", [], 24571), /escopo/);
  } finally {
    await db.close();
  }
});

// Production runs quotes and purchases concurrently with the commercial timer.
test("commercial facts never compete for the quote/purchase locks", async () => {
  const locks: number[] = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("pg_try_advisory_lock")) {
        const lock = Number(params?.[0]);
        locks.push(lock);
        return { rows: [{ ok: lock !== 81020 && lock !== 81021 }] };
      }
      return { rows: [] };
    },
  };
  for (const kind of [
    "fContratos",
    "fFaturamento",
    "fDevolucoesOutros",
    "fDevolucoesCompra",
  ] as const)
    await syncCommercialFacts(
      { company: 1, get: async () => ({ data: [] }) },
      db as any,
      kind,
    );
  assert.equal(new Set(locks).size, 4);
  assert.deepEqual(locks, [81030, 81031, 81032, 81033]);
});
