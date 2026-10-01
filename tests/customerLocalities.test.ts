import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  fetchCustomerLocalities,
  syncCustomerLocalities,
} from "../src/sync/customerLocalities.js";
const address = (n: number) => ({
  id: n,
  pessoaId: 7,
  tipoEndereco: "Entrega",
  cep: "00123000",
  logradouro: "Rua A",
  numero: "S/N",
  complemento: "Galpão",
  letra: "B",
  bairroNome: "Centro",
  municipioNome: "Aurora",
  estadoUFNome: "SC",
  paisNome: "Brasil",
});
test("localities follow documented pagination and reject wrong owners, malformed pages and repeats", async () => {
  const pages: number[] = [];
  const rows = await fetchCustomerLocalities(
    {
      get: async (path, params) => {
        assert.equal(path, "/v1/configuracoes/cliente/7/endereco");
        pages.push(Number(params.Page));
        return {
          data:
            params.Page === 1
              ? Array.from({ length: 100 }, (_, i) => address(i + 1))
              : [address(101)],
        };
      },
    },
    "7",
  );
  assert.deepEqual(pages, [1, 2]);
  assert.equal(rows.length, 101);
  assert.equal(rows[0]?.postal_code, "00123000");
  assert.equal(rows[0]?.number, "S/N");
  for (const data of [
    [{ ...address(1), pessoaId: 8 }],
    [{ ...address(1), id: 0 }],
    [address(1), address(1)],
  ])
    await assert.rejects(() =>
      fetchCustomerLocalities({ get: async () => ({ data }) }, "7"),
    );
  await assert.rejects(() =>
    fetchCustomerLocalities({ get: async () => ({ data: null }) }, "7"),
  );
  await assert.rejects(() =>
    fetchCustomerLocalities(
      { get: async () => ({ data: [], errors: [{}] }) },
      "7",
    ),
  );
  await assert.rejects(() =>
    fetchCustomerLocalities(
      {
        get: async () => ({
          data: Array.from({ length: 100 }, (_, i) => address(i + 1)),
        }),
      },
      "7",
    ),
  );
});
test("customer changes enqueue localities; snapshots use the shared company 1 directory and failures preserve previous data", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
    for (const file of readdirSync(
      new URL("../supabase/migrations/", import.meta.url),
    )
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      `INSERT INTO m8_customer_directory(company_id,person_id,payload,collected_at) VALUES(1,7,'{}',now()),(2,7,'{}',now())`,
    );
    const run = (company: number, data: unknown[]) =>
      syncCustomerLocalities({ company, get: async () => ({ data }) }, db);
    assert.equal(
      (await run(1, [address(1), { ...address(2), tipoEndereco: "Cobranca" }]))
        .checked,
      1,
    );
    await assert.rejects(
      () =>
        syncCustomerLocalities(
          {
            company: 2,
            get: async () => {
              assert.fail("must not call ERP");
            },
          },
          db,
        ),
      /empresa 1/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM m8_customer_locality_queue WHERE company_id<>1",
        )
      ).rows.length,
      0,
    );
    assert.equal((await run(1, [])).checked, 0);
    await db.exec(
      'UPDATE m8_customer_directory SET payload=\'{"nome":"Alterado"}\' WHERE company_id=1',
    );
    assert.equal(
      (await run(1, [{ ...address(1), logradouro: "Rua B" }])).checked,
      1,
    );
    const rows = (
      await db.query<{ street: string }>(
        "SELECT * FROM m8_customer_localities WHERE present ORDER BY company_id",
      )
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.street, "Rua B");

    await db.exec(
      "UPDATE m8_customer_locality_queue SET next_at=now() WHERE company_id=1",
    );
    const bad = await syncCustomerLocalities(
      {
        company: 1,
        get: async () => {
          throw new Error("offline");
        },
      },
      db,
    );
    assert.equal(bad.failures, 1);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM m8_customer_localities WHERE company_id=1 AND present",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM m8_customer_locality_queue WHERE company_id=1 AND error IS NOT NULL AND next_at>now()",
        )
      ).rows.length,
      1,
    );
    await db.exec(
      "UPDATE m8_customer_locality_queue SET next_at=now() WHERE company_id=1",
    );
    await run(1, []);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM m8_customer_localities WHERE company_id=1 AND present",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM m8_customer_localities WHERE company_id=2 AND present",
        )
      ).rows.length,
      0,
    );
    await db.exec(
      "UPDATE m8_customer_directory SET collected_at=now() WHERE company_id=1",
    );
    assert.equal((await run(1, [])).checked, 0); // unchanged directory does not restart the backlog every cycle
  } finally {
    await db.close();
  }
});

test("shared migration removes redundant copies and preserves canonical addresses and collection dates", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE m8_customer_directory(company_id integer,person_id bigint,payload jsonb)",
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/014_m8_customer_localities.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`INSERT INTO m8_customer_directory VALUES(1,7,'{}'),(2,7,'{}'),(27404,7,'{}');
    INSERT INTO m8_customer_localities(company_id,person_id,address_id,street,payload,collected_at)
    VALUES(1,7,1,'Original','{}','2026-09-30'),(2,7,1,'Duplicado','{}','2026-09-30'),(27404,7,1,'Duplicado','{}','2026-09-30')`);
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/015_m8_shared_customer_localities.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.query("SELECT company_id,street FROM m8_customer_localities"))
        .rows,
      [{ company_id: 1, street: "Original" }],
    );
    assert.deepEqual(
      (await db.query("SELECT company_id FROM m8_customer_locality_queue"))
        .rows,
      [{ company_id: 1 }],
    );
    await db.exec(
      `UPDATE m8_customer_directory SET payload='{"updated":true}' WHERE company_id<>1`,
    );
    assert.equal(
      (await db.query("SELECT * FROM m8_customer_locality_queue")).rows.length,
      1,
    );
    await assert.rejects(() =>
      db.exec(
        `INSERT INTO m8_customer_locality_queue(company_id,person_id) VALUES(2,8)`,
      ),
    );
  } finally {
    await db.close();
  }
});
