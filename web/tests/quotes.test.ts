import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  blankQuote,
  parseQuote,
  quoteTotals,
  type QuoteItem,
} from "../lib/quotes/types";
import {
  saveQuote,
  getQuote,
  QuoteConflict,
  listQuotes,
} from "../lib/quotes/store";
import { quoteSuggestions, quoteLookup } from "../lib/quotes/suggestions";
const material: QuoteItem = {
  key: "p:1:5:UN",
  kind: "material",
  code: "5",
  name: "Filtro",
  unit: "UN",
  quantity: "2.5",
  price: "10.25",
  selected: true,
  source: "Histórico",
  referencePrice: "12",
  minimumPrice: "9",
  lastPrice: "10",
  referenceAt: "",
};
const draft = () => ({
  ...blankQuote(),
  client: "Cliente teste",
  clientId: "1",
  equipment: "Compressor",
  model: "GA15",
  serial: "SN1234",
  serviceType: "Preventiva",
  items: [{ ...material }],
});
test("draft validation and totals count selected items only, round per line and reject malformed values", () => {
  const q = draft();
  q.items.push({ ...material, key: "excluded", price: "999", selected: false });
  assert.equal(quoteTotals(parseQuote(q).items).total, 2563);
  assert.throws(() => parseQuote({ ...q, company: "3" }));
  assert.throws(() => parseQuote({ ...q, client: "" }));
  assert.throws(() =>
    parseQuote({
      ...q,
      id: "------------------------------------",
      version: 1,
    }),
  );
  assert.throws(() => parseQuote({ ...q, items: [material, material] }));
  for (const patch of [
    { quantity: "0" },
    { price: "-1" },
    { price: "NaN" },
    { price: "1e3" },
    { quantity: "1.0001" },
    { price: "1.001" },
  ])
    assert.throws(() =>
      parseQuote({ ...q, items: [{ ...material, ...patch }] }),
    );
  assert.equal(quoteTotals([{ ...material, price: "0" }]).total, 0);
  assert.equal(parseQuote({ ...q, items: [] }).items.length, 0);
});
test("draft persistence, concurrent edits and equipment suggestions isolate company/client/serial and preserve manufacturer alternatives", async () => {
  const db = new PGlite(),
    globals = globalThis as unknown as { historyPool: unknown },
    previous = globals.historyPool;
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
    for (const name of ["004_manufacturer.sql", "005_quotes.sql"])
      await db.exec(
        readFileSync(new URL("../sql/" + name, import.meta.url), "utf8"),
      );
    const query = db.query.bind(db);
    globals.historyPool = {
      query,
      connect: async () => ({ query, release: () => {} }),
    };
    const saved = await saveQuote(draft(), "first@example.com");
    assert.equal(saved.version, 1);
    assert.equal((await getQuote(saved.id)).items[0].price, "10.25");
    const updated = await saveQuote(
      { ...saved, items: [{ ...material, price: "15" }] },
      "second@example.com",
    );
    assert.equal(updated.version, 2);
    await assert.rejects(
      () => saveQuote(saved, "first@example.com"),
      QuoteConflict,
    );
    assert.equal((await getQuote(saved.id)).items[0].price, "15");
    assert.equal((await listQuotes())[0].total_cents, "3750");
    assert.equal((await listQuotes("Cliente teste")).length, 1);
    assert.equal((await listQuotes("Inexistente")).length, 0);
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,cliente_id,cliente_nome,numero_serie,modelo_equipamento,status,emissao,payload)
    VALUES (1,1,1,'Cliente teste','SN1234','GA15','Processado','2026-01-01','{}'),
    (2,1,1,'Outro estoque','SN1234','GA15','Processado','2026-01-01','{}'),
    (1,2,2,'Outro cliente','SN1234','GA15','Processado','2026-01-01','{}'),
    (1,3,1,'Cliente teste','OUTRA','GA15','Processado','2026-01-01','{}');
    INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,finalized,pending,last_detail_at)
      SELECT company_id,id_m8,now(),true,false,now() FROM m8_ordens_servico;
    INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,produto_nome,unidade_nome,quantidade,valor_total,esta_excluido,payload)
      VALUES(1,1,1,5,'Filtro','UN',2,40,false,'{}'),(1,2,1,6,'Excluído','UN',1,50,true,'{}'),(2,1,1,7,'Empresa alheia','UN',1,50,false,'{}'),
      (1,1,2,8,'Cliente alheio','UN',1,50,false,'{}'),(1,1,3,9,'Outra série','UN',1,50,false,'{}');
    INSERT INTO m8_os_servicos(company_id,id_m8,ordem_servico_id,servico_id,servico_nome,quantidade,valor_total,payload)
      VALUES(1,1,1,10,'Revisão',2,100,'{}'),(2,1,1,20,'Outro serviço',1,200,'{}');
    INSERT INTO manufacturer_revisions(id,filename,active,report) VALUES('revision','fixture.xls',true,'{}');
    INSERT INTO manufacturer_variants(id,revision_id,name,header,models,rules,issues)
      VALUES('variant','revision','GA15','["GA15"]','["GA15"]','[]','[]');
    INSERT INTO manufacturer_entries(id,variant_id,sheet,row_number,section,description,code_original,code,observation,interval_original,interval_hours,issues)
      VALUES('entry','variant','GA15',1,'Peças','Filtro fabricante','1234567890','1234567890','','4000',4000,'[]'),
      ('unmapped','variant','GA15',2,'Peças','Peça sem vínculo','9999999999','9999999999','','8000',8000,'[]'),
      ('notdue','variant','GA15',3,'Peças','Não vence','8888888888','8888888888','','6000',6000,'[]');
    INSERT INTO m8_product_catalog(company_id,product_id,name,unit,payload,collected_at) VALUES
      (1,5,'Filtro','UN','{"referenciaFabricante":"1234567890"}',now()),
      (1,11,'Alternativo','UN','{"codigoSimilaridade":"1234567890"}',now());`);
    const result = await quoteSuggestions(
      new URLSearchParams(
        "company=1&clientId=1&serial=SN1234&model=GA15&interval=h:8000",
      ),
    );
    assert.equal(result.items.length, 6);
    assert(result.items.some((i) => i.name === "Empresa alheia"));
    assert(!result.items.some((i) => i.name === "Cliente alheio"));
    const filter = result.items.find((i) => i.code === "5")!;
    assert.match(filter.source, /Histórico/);
    assert.match(filter.source, /Genuína/);
    assert.equal(filter.lastPrice, "20");
    assert.equal(filter.selected, false);
    assert.equal(filter.price, "");
    assert(result.items.some((i) => i.name === "Peça sem vínculo"));
    assert(
      !result.items.some(
        (i) => i.name === "Não vence" || i.name === "Excluído",
      ),
    );
    assert.equal(
      result.items.find((i) => i.kind === "service")?.lastPrice,
      "50",
    );
    const manual = await quoteSuggestions(
      new URLSearchParams("company=1&model=GA15&serial=X"),
    );
    assert(!manual.items.some((i) => i.kind === "service"));
    const lookup = await quoteLookup(
      new URLSearchParams("lookup=clients&company=1&q=teste"),
    );
    assert.equal(lookup.rows?.length, 1);
    const eq = await quoteLookup(
      new URLSearchParams("lookup=equipment&company=1&clientId=1"),
    );
    assert.equal(eq.rows?.length, 2);
    const initialClients = await quoteLookup(
      new URLSearchParams("lookup=clients"),
    );
    assert(initialClients.rows?.length);
    const noEquipment = await quoteLookup(
      new URLSearchParams("lookup=equipment&clientId=1&q=SEM-CORRESPONDENCIA"),
    );
    assert.equal(noEquipment.rows?.length, 0);

    await db.exec("SET ROLE anon");
    await assert.rejects(() => db.query("SELECT * FROM web_quotes"));
    await db.exec("RESET ROLE");
  } finally {
    globals.historyPool = previous;
    await db.close();
  }
});
