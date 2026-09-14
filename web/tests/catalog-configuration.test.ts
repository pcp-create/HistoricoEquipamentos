import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { validateCatalogRecords } from "../lib/manufacturer/configuration";
import {
  saveCatalogRecords,
  updateCatalogItem,
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
    const before = (await catalogConfigurationItems(added.id))[0];
    const edited = await updateCatalogItem(
      {
        ...before,
        description: "Filtro revisado",
        interval_original: "",
        previous: before,
      },
      "editor@example.com",
    );
    assert.equal(edited.item.id, before.id);
    assert.equal(edited.item.description, "Filtro revisado");
    assert.equal(edited.item.interval_hours, null);
    await assert.rejects(
      () =>
        updateCatalogItem(
          { ...before, description: "Conflito", previous: before },
          "other@example.com",
        ),
      /outro usuário/,
    );
    await assert.rejects(
      () =>
        updateCatalogItem(
          { ...edited.item, code_original: "M8:999999", previous: edited.item },
          "editor@example.com",
        ),
      /não encontrado/,
    );
    const audit = (
      await db.query<{ report: any }>(
        "SELECT report FROM manufacturer_revisions WHERE id='catalogo-cadastrado-no-sistema'",
      )
    ).rows[0].report;
    assert.equal(audit.itemEdits[0].before.description, before.description);
    assert.equal(audit.itemEdits[0].email, "editor@example.com");
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
    await db.exec(
      "INSERT INTO m8_product_catalog(company_id,product_id,name,collected_at,payload) VALUES(1,19273,'Juntas',now(),'{}')",
    );
    const piston = {
      ...record,
      manufacturer: "Wayne",
      model: "W800",
      version: "Consumíveis",
      serial: "",
      reference: "",
      interval: "",
      internalCode: "19273",
      modelOnly: "Sim",
      intervalUnknown: "Sim",
      quantity: "2",
      drawingCode: "26",
      saleFactor: "2,5",
      conditions: "Conferir padrão construtivo",
    };
    assert.equal(
      (await saveCatalogRecords([piston], "test@example.com")).inserted,
      1,
    );
    assert.equal(
      (await saveCatalogRecords([piston], "test@example.com")).skipped,
      1,
    );
    const pv = (await catalogConfiguration()).versions.find((v) =>
      v.models.includes("W800"),
    );
    assert.ok(pv.header.includes("Aplicação somente por modelo"));
    assert.ok(pv.header.includes(piston.conditions));
    const pi = (await catalogConfigurationItems(pv.id))[0];
    assert.equal(pi.code, "M8:19273");
    assert.equal(pi.interval_hours, null);
    assert.ok(pi.observation.includes("Quantidade na lista: 2."));
    assert.ok(pi.observation.includes("valor original: 2,5."));
    await assert.rejects(() =>
      saveCatalogRecords(
        [{ ...piston, conditions: "Outra condição" }],
        "test@example.com",
      ),
    );
  } finally {
    globals.historyPool = old;
    await db.close();
  }
});

test("manual extras validate model-only application and explicit missing intervals", () => {
  const r = {
    ...record,
    serial: "",
    reference: "",
    internalCode: "19273",
    modelOnly: "Sim",
    interval: "",
    intervalUnknown: "Sim",
    quantity: "3",
    saleFactor: "1,25",
  };
  assert.deepEqual(validateCatalogRecords([r]).errors, []);
  for (const change of [
    { internalCode: "x" },
    { quantity: "-1" },
    { saleFactor: "NaN" },
    { serial: "BQD100000 ..." },
    { interval: "4000" },
    { internalCode: "" },
  ])
    assert.ok(validateCatalogRecords([{ ...r, ...change }]).errors.length);
});
