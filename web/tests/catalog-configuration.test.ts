import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { validateCatalogRecords } from "../lib/manufacturer/configuration";
import {
  saveCatalogRecords,
  catalogConfiguration,
  catalogConfigurationItems,
} from "../lib/manufacturer/configuration-store";
import {
  manufacturerCatalog,
  manualFilters,
} from "../lib/manufacturer/catalog";
const record = {
  manufacturer: "Outra marca",
  model: "SM 15",
  version: "Série BQD",
  serial: "BQD100000 ...",
  section: "Filtros",
  description: "Filtro de óleo",
  reference: "0012345678",
  interval: "4000",
  observation: "Conferir aplicação",
};
test("catalog records require complete fields, valid references, hours and unambiguous serial rules", () => {
  assert.deepEqual(validateCatalogRecords([record]).errors, []);
  for (const patch of [
    { manufacturer: "" },
    { reference: "123" },
    { interval: "4.000 h" },
    { serial: "talvez BQD" },
  ])
    assert(validateCatalogRecords([{ ...record, ...patch }]).errors.length);
  assert(
    validateCatalogRecords([record, { ...record, serial: "BQD200000 ..." }])
      .errors.length,
  );
  assert(validateCatalogRecords([]).errors.length);
});
test("additional catalog coexists with original, deduplicates and rolls back conflicting batches", async () => {
  const db = new PGlite();
  const globals = globalThis as unknown as { historyPool: unknown };
  const old = globals.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
    for (const file of readdirSync(
      new URL("../../supabase/migrations/", import.meta.url),
    )
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      readFileSync(
        new URL("../sql/004_manufacturer.sql", import.meta.url),
        "utf8",
      ),
    );
    const query = db.query.bind(db);
    globals.historyPool = {
      query,
      connect: async () => ({ query, release() {} }),
    };
    await db.exec(
      `INSERT INTO manufacturer_revisions VALUES('original','Original.xls',now(),true,'{}'); INSERT INTO manufacturer_variants VALUES('original-version','original','GA15','[]','["GA15"]','[]','[]');`,
    );
    assert.equal(
      (await saveCatalogRecords([record], "test@example.com")).inserted,
      1,
    );
    assert.equal(
      (await saveCatalogRecords([record], "test@example.com")).skipped,
      1,
    );
    const config = await catalogConfiguration();
    assert.equal(config.versions.length, 2);
    const added = config.versions.find((v) => v.id !== "original-version")!;
    assert.equal(
      (await catalogConfigurationItems(added.id))[0].code_original,
      "0012345678",
    );
    const catalog = await manufacturerCatalog(
      manualFilters(new URLSearchParams("model=SM+15&serial=BQD100001")),
      true,
    );
    assert.equal(catalog.variants.length, 1);
    assert.equal(catalog.variants[0].match, "match");
    await assert.rejects(() =>
      saveCatalogRecords(
        [
          { ...record, version: "New" },
          { ...record, serial: "BQD200000 ..." },
        ],
        "test@example.com",
      ),
    );
    assert.equal((await catalogConfiguration()).versions.length, 2);
    assert.equal(
      (
        await db.query<{ active: boolean }>(
          "SELECT active FROM manufacturer_revisions WHERE id='original'",
        )
      ).rows[0].active,
      true,
    );
  } finally {
    globals.historyPool = old;
    await db.close();
  }
});
