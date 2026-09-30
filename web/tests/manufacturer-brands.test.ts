import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { variantBrand } from "../lib/manufacturer/brands";
import {
  manufacturerCatalog,
  manualFilters,
} from "../lib/manufacturer/catalog";
test("brands come from explicit manufacturer and original catalog provenance, not model prefixes", () => {
  assert.equal(
    variantBrand({
      name: "GA15",
      header: ["GA15"],
      source_filename: "Comparativo 2017 GA-GX Rev.11.xls",
    }),
    "Atlas Copco",
  );
  assert.equal(
    variantBrand({ name: "GA15", header: ["GA15"] }),
    "Não informada",
  );
  assert.equal(
    variantBrand({ name: "W800", header: ["Padrão construtivo Wayne"] }),
    "Wayne",
  );
  assert.equal(
    variantBrand({ name: "TPF15", header: ["Metalplan"] }),
    "Metalplan",
  );
  assert.equal(
    variantBrand({ name: "PSV25AP", header: ["Pressure"] }),
    "Pressure",
  );
  assert.equal(
    variantBrand({
      name: "Novo",
      header: ["Kaeser"],
      source_filename: "Cadastros adicionais do sistema",
    }),
    "Kaeser",
  );
});
test("brand scope also restricts versions and intervals and cannot be bypassed by a foreign variant", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  g.historyPool = db;
  try {
    await db.exec(`CREATE TABLE manufacturer_revisions(id text,filename text,imported_at timestamptz DEFAULT now(),report jsonb,active boolean);
   CREATE TABLE manufacturer_variants(id text,revision_id text,name text,header jsonb,models jsonb,rules jsonb,issues jsonb);
   CREATE TABLE manufacturer_entries(id text,variant_id text,row_number integer,interval_original text,interval_hours integer);`);
    const brands = ["Atlas Copco", "Wayne", "Metalplan", "Pressure"];
    for (const [index, brand] of brands.entries()) {
      await db.query(
        "INSERT INTO manufacturer_revisions(id,filename,report,active) VALUES($1,$2,$3,$4)",
        [
          String(index),
          index === 0 ? "Comparativo 2017 GA-GX Rev.11.xls" : brand + ".xlsx",
          JSON.stringify({ managed: index !== 0 }),
          index === 0,
        ],
      );
      await db.query(
        "INSERT INTO manufacturer_variants VALUES($1,$1,$2,$3,$4,$5,$5)",
        [
          String(index),
          brand,
          JSON.stringify([brand]),
          JSON.stringify(["Model " + index]),
          "[]",
        ],
      );
      await db.query("INSERT INTO manufacturer_entries VALUES($1,$1,1,$2,$3)", [
        String(index),
        String((index + 1) * 2000),
        (index + 1) * 2000,
      ]);
    }
    const all = await manufacturerCatalog(
      manualFilters(new URLSearchParams()),
      true,
    );
    assert.equal(all.brands.length, 4);
    for (const [i, brand] of brands.entries()) {
      const result = await manufacturerCatalog(
        manualFilters(new URLSearchParams({ brand })),
        true,
      );
      assert.equal(result.variants.length, 1);
      assert.equal(result.variants[0].brand, brand);
      assert.equal(result.intervals.length, 1);
      assert.equal(result.intervals[0].hours, (i + 1) * 2000);
      assert.equal(result.brands.length, 4);
    }
    const bad = await manufacturerCatalog(
      manualFilters(new URLSearchParams({ brand: "Wayne", variant: "0" })),
      true,
    );
    assert.equal(bad.intervals.length, 0);
    assert.ok(bad.variants.every((v) => v.brand === "Wayne"));
    const unknown = await manufacturerCatalog(
      manualFilters(new URLSearchParams({ brand: "Inexistente" })),
      true,
    );
    assert.equal(unknown.variants.length, 0);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
