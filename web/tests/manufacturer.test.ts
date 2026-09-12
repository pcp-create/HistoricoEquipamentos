import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import * as XLSX from "xlsx";
import { parseManual } from "../lib/manufacturer/importer";
import {
  serialMatch,
  catalogSearchTerms,
  normalizeCode,
  modelKeys,
  variantMatch,
} from "../lib/manufacturer/rules";
import {
  manufacturerCatalog,
  manualFilters,
  equipmentConsumption,
} from "../lib/manufacturer/catalog";

test("serial rules preserve prefix, range boundaries and ambiguous expressions", () => {
  for (const serial of ["BRP060001", "BRP065117"])
    assert.equal(serialMatch("BRP 060001 a 065117", serial), "match");
  for (const serial of ["BRP060000", "BRP065118", "BQD060002"])
    assert.equal(serialMatch("BRP060001 a BRP065117", serial), "no");
  assert.equal(serialMatch("200.772 a BRP065117", "200800"), "review");
  assert.equal(serialMatch("500/501.xxx", "500100"), "review");
  assert.equal(serialMatch("110.xxx", "110001"), "match");
  assert.equal(serialMatch("110.xxx", "1100001"), "no");
  assert.equal(serialMatch("BQD100000 ...", "BQD100001"), "match");
  assert.equal(serialMatch("315001", "315002"), "no");
  assert.equal(serialMatch("até BRP065117", "BRP065117"), "match");
  assert.equal(normalizeCode("0367 0100 55"), "0367010055");
  assert.deepEqual(modelKeys("GA 15+ / GA 15 VSD+"), ["GA15+", "GA15VSD+"]);
  const v = {
    id: "a",
    name: "GA15+",
    models: ["GA15+"],
    header: [],
    rules: [],
    issues: [],
  };
  assert.equal(variantMatch(v, "GA15", ""), "no");
  assert.equal(variantMatch(v, "GA15+", "BRP000001"), "review");
});
test("serial ranges accept manufacturer labels, open bounds and preserve precision", () => {
  for (const expression of [
    "De Série BRP060001 até série BRP065117",
    "BRP060001 - BRP065117",
    "BRP 060001 até 065117",
  ]) {
    for (const serial of ["BRP060001", "brp-063000", "BRP065117"])
      assert.equal(serialMatch(expression, serial), "match");
    for (const serial of ["BRP060000", "BRP065118", "BQD063000", "BRP63000"])
      assert.equal(serialMatch(expression, serial), "no");
  }
  assert.equal(
    serialMatch("A partir da série BQD100000", "BQD100000"),
    "match",
  );
  assert.equal(serialMatch("A partir da série BQD100000", "BQD099999"), "no");
  assert.equal(serialMatch("Até a série BQD100000", "BQD100000"), "match");
  assert.equal(serialMatch("Após série BQD100000", "BQD100000"), "no");
  assert.equal(
    serialMatch("De BRP065117 até BRP060001", "BRP063000"),
    "review",
  );
  assert.equal(
    serialMatch("De BRP060001 até BQD065117", "BRP063000"),
    "review",
  );
  assert.equal(
    serialMatch(
      "ABC9007199254740992 a ABC9007199254740992",
      "ABC9007199254740993",
    ),
    "no",
  );
});
function workbook() {
  const b = XLSX.utils.book_new();
  const sheet: XLSX.WorkSheet = {
    "!ref": "B8:E17",
    B8: { t: "s", v: "GA 15" },
    B10: { t: "s", v: "PEÇAS PRINCIPAIS" },
    B11: { t: "s", v: "Correia" },
    C11: { t: "n", v: 367010055, z: "0000000000" },
    E11: { t: "n", v: 4000 },
    C12: { t: "s", v: "1234 5678 90" },
    B13: { t: "s", v: "Calculado" },
    C13: { t: "n", v: 1234567890, f: "1+1" },
    B14: { t: "s", v: "Sem zeros" },
    C14: { t: "n", v: 367010057 },
    B15: { t: "s", v: "Termostática" },
    C15: { t: "s", v: "0987654321" },
    E15: { t: "s", v: "6000 / 8000" },
    B16: { t: "s", v: "Com erro" },
    C16: { t: "e", v: 7 },
  };
  XLSX.utils.book_append_sheet(b, sheet, "GA 15 geração");
  XLSX.utils.book_append_sheet(
    b,
    {
      "!ref": "C8:D8",
      C8: { t: "s", v: "GA 15" },
      D8: {
        t: "s",
        v: "BRP060001 a BRP065117",
        l: { Target: "#'GA 15 geração'!A1" },
      },
    },
    "SELEÇÃO",
  );
  XLSX.utils.book_append_sheet(
    b,
    XLSX.utils.aoa_to_sheet([["revisões"]]),
    "Plan1",
  );
  return XLSX.write(b, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
test("import keeps source rows, displayed leading zeros, conditions and uncertain data", () => {
  const b = workbook(),
    d = parseManual(b, "teste.xlsx");
  assert.equal(d.variants.length, 1);
  assert.equal(d.entries.length, 6);
  assert.equal(d.entries[0].row, 11);
  assert.equal(d.entries[0].code, "0367010055");
  assert.equal(d.entries[0].interval_hours, 4000);
  assert.match(d.entries[1].issues.join(), /Descrição ausente/);
  assert.equal(d.entries[2].code, null);
  assert.equal(d.entries[3].code, null);
  assert.equal(d.entries[4].interval_hours, null);
  assert.equal(d.entries[5].code, null);
  assert.equal(d.variants[0].rules[0].cell, "D8");
  assert.equal(variantMatch(d.variants[0], "GA15", "BRP060001"), "match");
  assert.deepEqual(parseManual(b, "teste.xlsx"), d);
});
test("catalog SQL indexes exact multi-code references, refreshes on M8 updates and isolates consumption", async () => {
  const db = new PGlite();
  const globals = globalThis as unknown as { historyPool: unknown };
  const previous = globals.historyPool;
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated");
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
    await db.exec(
      `INSERT INTO m8_product_catalog(company_id,product_id,name,collected_at,payload) VALUES(1,10,'Correia',now(),'{"codigoSimilaridade":"0367 0100 55; 1234567890","referenciaFabricante":"0987654321"}'),(2,10,'Outro estoque',now(),'{"codigoSimilaridade":"0367010055"}');`,
    );
    await db.exec(
      readFileSync(
        new URL("../sql/004_manufacturer.sql", import.meta.url),
        "utf8",
      ),
    );
    const tokens = await db.query<{ code: string }>(
      `SELECT manufacturer_code_tokens('ref 0367 0100 55 / 1234567890; 99123456789099') AS code`,
    );
    assert(tokens.rows.some((r) => r.code === "0367010055"));
    assert(tokens.rows.some((r) => r.code === "1234567890"));
    assert.equal(
      (
        await db.query(
          `SELECT * FROM manufacturer_code_tokens('99123456789099') c WHERE c='1234567890'`,
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `SELECT * FROM manufacturer_product_codes WHERE code='0367010055'`,
        )
      ).rows.length,
      2,
    );
    await db.exec(
      `UPDATE m8_product_catalog SET payload='{"referenciaFabricante":"0367 0100 55","bloqueado":"Sim"}' WHERE company_id=1`,
    );
    assert.equal(
      (
        await db.query(
          `SELECT * FROM manufacturer_product_codes WHERE company_id=1 AND field='codigoSimilaridade'`,
        )
      ).rows.length,
      0,
    );
    await db.exec(`SET ROLE anon`);
    await assert.rejects(db.query("SELECT * FROM manufacturer_entries"));
    await db.exec("RESET ROLE");
    const d = parseManual(workbook(), "teste.xlsx");
    await db.query(
      "INSERT INTO manufacturer_revisions(id,filename,report,active) VALUES($1,$2,$3,true)",
      [d.revision, d.filename, JSON.stringify(d.report)],
    );
    await db.query(
      `INSERT INTO manufacturer_variants SELECT p.id,$1,p.name,p.header,p.models,p.rules,p.issues FROM jsonb_to_recordset($2::jsonb) AS p(id text,name text,header jsonb,models jsonb,rules jsonb,issues jsonb)`,
      [d.revision, JSON.stringify(d.variants)],
    );
    await db.query(
      `INSERT INTO manufacturer_entries SELECT p.id,p.variant_id,p.sheet,p."row",p.section,p.description,p.code_original,p.code,p.observation,p.interval_original,p.interval_hours,p.issues FROM jsonb_to_recordset($1::jsonb) AS p(id text,variant_id text,sheet text,"row" integer,section text,description text,code_original text,code text,observation text,interval_original text,interval_hours numeric,issues jsonb)`,
      [JSON.stringify(d.entries)],
    );
    globals.historyPool = db;
    for (const q of [
      "BRP060001",
      "BRP063000",
      "BRP065117",
      "brp-063000",
      "BRP 063000",
    ]) {
      const result = await manufacturerCatalog(
        manualFilters(new URLSearchParams({ q, model: "GA15" })),
      );
      assert.equal(result.total, 6, q);
      assert(result.rows.every((row) => row.match === "match"));
    }
    assert.deepEqual(catalogSearchTerms("Correia BRP 063000", d.variants), [
      "CORREIA",
      "BRP063000",
    ]);
    for (const q of ["BRP060000", "BRP065118", "BQD063000"]) {
      assert.equal(
        (await manufacturerCatalog(manualFilters(new URLSearchParams({ q }))))
          .total,
        0,
        q,
      );
    }
    const mixed = await manufacturerCatalog(
      manualFilters(new URLSearchParams({ q: "BRP063000 Correia" })),
    );
    assert.equal(mixed.total, 1);
    const bySerial = await manufacturerCatalog(
      manualFilters(
        new URLSearchParams({ serial: "BRP063000", model: "GA15" }),
      ),
    );
    assert.equal(bySerial.total, 6);
    assert.equal(
      (
        await manufacturerCatalog(
          manualFilters(new URLSearchParams({ serial: "BRP065118" })),
        )
      ).total,
      0,
    );
    assert.equal(
      (
        await manufacturerCatalog(
          manualFilters(new URLSearchParams({ q: "BRP063000", model: "GX7" })),
        )
      ).total,
      0,
    );

    const revisionItems = await manufacturerCatalog(
      manualFilters(new URLSearchParams("model=GA15&interval=h:8000")),
    );
    assert.equal(revisionItems.total, 2);
    assert.deepEqual(
      revisionItems.rows.map((e) => e.interval_original).sort(),
      ["4000", "6000 / 8000"],
    );
    const intervalMetadata = await manufacturerCatalog(
      manualFilters(new URLSearchParams("model=GA15")),
      true,
    );
    assert.equal(
      intervalMetadata.intervals.find((i) => i.value === "h:8000")?.count,
      2,
    );
    assert.equal(intervalMetadata.rows.length, 0);
    const catalog = await manufacturerCatalog(
      manualFilters(new URLSearchParams("company=1&q=0367010055")),
    );
    assert.equal(catalog.total, 1);
    assert.equal(catalog.rows[0].products[0].blocked, "Sim");
    assert.equal(catalog.rows[0].products.length, 1);
    assert.deepEqual(catalog.rows[0].products[0].fields, [
      "referenciaFabricante",
    ]);
    const internalCode = await manufacturerCatalog(
      manualFilters(new URLSearchParams("q=10")),
    );
    assert(internalCode.rows.some((e) => e.code === "0367010055"));
    const listFilter = await manufacturerCatalog(
      manualFilters(new URLSearchParams("list=correia")),
    );
    assert(listFilter.rows.length > 0);
    const missingList = await manufacturerCatalog(
      manualFilters(new URLSearchParams("list=SEM-ITEM-XYZ")),
    );
    assert.equal(missingList.total, 0);
    // Limit distinct products after prioritizing genuine references, then expand all company balances.
    await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,name,unit,collected_at,payload)
      SELECT company,product,'Peça teste','UN',now(),jsonb_build_object(CASE WHEN product=99 THEN 'referenciaFabricante' ELSE 'codigoSimilaridade' END,'0367010055')
      FROM unnest(ARRAY[1,2,27404]) company CROSS JOIN unnest(ARRAY[20,21,22,23,24,25,26,27,28,29,99]) product;
      UPDATE m8_product_catalog SET payload='{}' WHERE company_id=27404 AND product_id=99;`);
    const grouped = await manufacturerCatalog(
      manualFilters(new URLSearchParams("q=0367010055")),
    );
    const matches = grouped.rows[0].products;
    assert.equal(
      new Set(matches.map((p: { product_id: string }) => p.product_id)).size,
      8,
    );
    assert.equal(matches[0].product_id, "10");
    assert.equal(matches[2].product_id, "99");
    assert.equal(
      matches.filter((p: { product_id: string }) => p.product_id === "99")
        .length,
      3,
    );
    assert.equal(
      matches.find(
        (p: { product_id: string; company_id: number }) =>
          p.product_id === "99" && Number(p.company_id) === 27404,
      ).fields.length,
      0,
    );
    assert.equal(matches[0].match_total, 12);
    const companyOnly = await manufacturerCatalog(
      manualFilters(new URLSearchParams("q=0367010055&company=2")),
    );
    assert(
      companyOnly.rows[0].products.every(
        (p: { company_id: number }) => Number(p.company_id) === 2,
      ),
    );
    assert.equal(companyOnly.rows[0].products[0].product_id, "99");
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,numero_serie,status,payload) VALUES (1,1,'BRP-060001','Processado','{}'),(2,2,'BRP060001','Processado','{}'),(1,3,'XBRP060001','Processado','{}'),(1,4,'BRP060001','Processado','{}');
 INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,finalized,pending,last_detail_at) SELECT company_id,id_m8,now(),true,false,now() FROM m8_ordens_servico;
 UPDATE integracao_m8_os_sync SET pending=true,finalized=false WHERE ordem_servico_id=4;
 INSERT INTO m8_os_produtos(company_id,ordem_servico_id,id_m8,produto_id,produto_nome,quantidade,unidade_nome,esta_excluido,payload) VALUES(1,1,1,10,'Correia',2,'UN',false,'{}'),(1,1,2,10,'Excluído',99,'UN',true,'{}'),(2,2,3,10,'Empresa 2',50,'UN',false,'{}'),(1,3,4,10,'Outra série',80,'UN',false,'{}'),(1,4,5,10,'Pendente',20,'UN',false,'{}');
 INSERT INTO m8_equipamentos(company_id,ordem_servico_id,id_m8,numero_serie,payload) VALUES(1,1,1,'BRP060001','{}'),(1,1,2,'BRP060001','{}');`);
    const combined = await equipmentConsumption("", "BRP060001");
    assert.equal(Number(combined.rows[0].quantity), 52);
    const consumption = await equipmentConsumption("1", "BRP060001");
    assert.equal(consumption.orders, 2);
    assert.equal(consumption.rows.length, 1);
    assert.equal(Number(consumption.rows[0].quantity), 2);
  } finally {
    globals.historyPool = previous;
    await db.close();
  }
});
