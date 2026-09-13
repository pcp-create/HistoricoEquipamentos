import { groupedProducts } from "../lib/manufacturer/products";
import { compareQuoteItems, quoteOrigin } from "../lib/quotes/presentation";
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
  assert.equal(
    parseQuote({ ...q, client: "", equipment: "", serviceType: "" }).client,
    "",
  );
  assert.throws(() => parseQuote({ ...q, responsible: "x".repeat(201) }));
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
    await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,name,unit,payload,collected_at) VALUES(1,99,'ÓLEO sem venda','UN','{}',now());
      INSERT INTO m8_service_catalog(company_id,service_id,name,unit,internal_code,sale_price,collected_at,payload) VALUES(1,10,'Revisão de óleo','H','SV10',250,now(),'{}'),(2,88,'Serviço nunca vendido','H','SV88',500,now(),'{}');`);
    await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,name,unit,payload,collected_at) VALUES(2,99,'ÓLEO sem venda','UN','{}',now());
      INSERT INTO m8_product_stock(company_id,product_id,establishment_id,stock,collected_at,payload) VALUES(1,99,1,10,now(),'{}'),(2,99,1,5,now(),'{}');
      INSERT INTO m8_product_available(company_id,product_id,establishment_id,available,collected_at) VALUES(1,99,1,7,now()),(2,99,1,2,now());`);
    await db.exec(
      `INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,produto_nome,unidade_nome,quantidade,valor_total,aprovado,payload) VALUES(1,999,1,5,'Não aprovado','UN',99,9999,'Nao','{}');`,
    );
    for (const query of ["oleo", "OLEO", "ÓLEO", "óleo"]) {
      const catalog = await quoteLookup(
        new URLSearchParams({ lookup: "materials", q: query }),
      );
      assert.equal(catalog.items?.length, 1);
      assert.equal(catalog.items?.[0].code, "99");
      assert.equal(catalog.items?.[0].generalSale, undefined);
      const balance = groupedProducts(catalog.items![0].products!)[0];
      assert.equal(balance.stock.value, 15);
      assert.equal(balance.available.value, 9);
      assert.equal(balance.companies.length, 2);
      assert.equal(quoteOrigin(catalog.items![0]), "unknown");
      const serviceCatalog = await quoteLookup(
        new URLSearchParams({ lookup: "services", q: query }),
      );
      assert.equal(serviceCatalog.items?.length, 1);
      assert.equal(serviceCatalog.items?.[0].generalSale?.order, "1");
    }
    const allServices = await quoteLookup(
      new URLSearchParams("lookup=services"),
    );
    assert.equal(allServices.items?.length, 2);
    assert(allServices.items?.some((i) => i.code === "88" && !i.generalSale));
    const globalProduct = (
      await quoteLookup(new URLSearchParams("lookup=materials&q=Filtro"))
    ).items![0];
    assert.equal(Number(globalProduct.generalSale!.unitPrice), 20);
    assert.equal(
      parseQuote({
        ...draft(),
        items: [{ ...globalProduct, selected: true, price: "20" }],
      }).items[0].generalSale?.order,
      "1",
    );
    assert.equal(
      (await quoteLookup(new URLSearchParams("lookup=materials&q=%"))).items
        ?.length,
      0,
    );
    const noIdentity = await quoteSuggestions(new URLSearchParams());
    assert.equal(noIdentity.variants.length, 1);
    assert.equal(noIdentity.recommendations.length, 0);
    assert.equal(noIdentity.intervals.length, 0);
    await db.query(`INSERT INTO manufacturer_variants(id,revision_id,name,header,models,rules,issues)
      VALUES('other','revision','GX99','["GX99"]','["GX99"]','[]','[]')`);
    const complete = await quoteSuggestions(new URLSearchParams());
    assert.equal(complete.variants.length, 2);
    assert(complete.variants.every((v) => !v.suggested));
    const ranked = await quoteSuggestions(new URLSearchParams("model=GA15"));
    assert.equal(ranked.variants.length, 2);
    assert.equal(
      ranked.variants.find((v) => v.id === "variant")?.suggested,
      true,
    );
    assert.equal(
      ranked.variants.find((v) => v.id === "other")?.suggested,
      false,
    );
    const override = await quoteSuggestions(
      new URLSearchParams("model=GA15&variant=other"),
    );
    assert.equal(override.variants.length, 2);
    assert.equal(override.recommendations.length, 0);
    const chosenManually = await quoteSuggestions(
      new URLSearchParams("variant=variant&interval=h:8000"),
    );
    assert.equal(chosenManually.recommendations.length, 2);
    assert(chosenManually.intervals.length > 0);
    assert.deepEqual(chosenManually.histories, {});
    assert(
      chosenManually.warnings.some((warning) =>
        warning.includes("não foi confirmada"),
      ),
    );
    const result = await quoteSuggestions(
      new URLSearchParams(
        "company=1&clientId=1&serial=SN1234&model=GA15&interval=h:8000",
      ),
    );
    assert.equal(result.items.length, 6);
    assert.equal(result.recommendations.length, 2);
    const recommended = result.recommendations.find((r) => r.id === "entry")!;
    assert.equal(recommended.name, "Filtro fabricante");
    assert.deepEqual(
      recommended.products.map((p) => p.product_id),
      ["5", "11"],
    );
    assert(
      recommended.itemKeys.includes(
        result.items.find((i) => i.code === "5")!.key,
      ),
    );
    assert.equal(
      result.recommendations.find((r) => r.id === "unmapped")!.products.length,
      0,
    );
    await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,name,unit,payload,collected_at) VALUES
      (2,11,'Alternativo','UN','{}',now()),
      (27404,12,'Similar outra empresa','UN','{"codigoSimilaridade":"1234567890"}',now());`);
    const expanded = await quoteSuggestions(
      new URLSearchParams("model=GA15&interval=h:8000"),
    );
    const expandedRecommendation = expanded.recommendations.find(
      (r) => r.id === "entry",
    )!;
    assert.equal(expandedRecommendation.products.length, 4);
    assert.equal(expandedRecommendation.itemKeys.length, 3);
    assert(expanded.items.some((i) => i.code === "12"));

    assert(result.items.some((i) => i.name === "Empresa alheia"));
    assert(!result.items.some((i) => i.name === "Cliente alheio"));
    const filter = result.items.find((i) => i.code === "5")!;
    assert.match(filter.source, /Histórico/);
    assert.match(filter.source, /Genuína/);
    assert.equal(Number(filter.lastPrice), 20);
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

    const originalHistory = result.histories[filter.key];
    assert.equal(originalHistory.count, 1);
    assert.equal(originalHistory.rows[0].quantity, "2");
    assert.equal(Number(originalHistory.rows[0].unitPrice), 20);
    assert.equal(result.histories["p:1:8:UN"], undefined);
    assert.equal(result.histories["p:1:9:UN"], undefined);
    assert.equal(result.histories["p:1:6:UN"], undefined);
    assert.equal(
      (await quoteSuggestions(new URLSearchParams("model=GA15"))).histories[
        filter.key
      ],
      undefined,
    );
    await db.exec(`
      INSERT INTO m8_ordens_servico(company_id,id_m8,cliente_id,numero_serie,status,payload,emissao)
        SELECT 2,100+n,1,'SN1234','Processado','{}','2026-08-01'::date+n FROM generate_series(0,6) n;
      INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,finalized,pending,last_detail_at)
        SELECT 2,100+n,now(),true,false,now() FROM generate_series(0,6) n;
      INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,produto_nome,unidade_nome,quantidade,valor_total,payload)
        SELECT 2,100+n,100+n,5,'Filtro','UN',2,CASE WHEN n=0 THEN 2 ELSE (n+1)*20 END,'{}' FROM generate_series(0,6) n;
      INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,produto_nome,unidade_nome,quantidade,valor_total,payload)
        VALUES(2,999,106,5,'Filtro','UN',1,50,'{}'),(2,998,106,5,'Filtro','CX',1,9999,'{}');
    `);
    const recent = await quoteSuggestions(
      new URLSearchParams("clientId=1&serial=SN1234"),
    );
    const history = recent.histories[filter.key];
    assert.equal(history.count, 8);
    assert.equal(history.rows.length, 5);
    assert.equal(history.rows[0].order, "106");
    assert.equal(history.rows[0].quantity, "3");
    assert.equal(history.rows[0].total, "190");
    assert.equal(Number(history.minimum), 1); // Includes older OS outside the last five.
    assert(Math.abs(Number(history.maximum) - 190 / 3) < 0.000001);
    assert.equal(Number(recent.histories["p:1:5:CX"].maximum), 9999);
    await db.exec(
      "UPDATE m8_os_produtos SET valor_total=NULL WHERE company_id=2 AND id_m8=999",
    );
    const unknown = await quoteSuggestions(
      new URLSearchParams("clientId=1&serial=SN1234"),
    );
    assert.equal(unknown.histories[filter.key].rows[0].unitPrice, "");
    assert.equal(
      unknown.items.find((i) => i.key === filter.key)!.lastPrice,
      "",
    );
    const unfinished = await saveQuote(
      {
        ...blankQuote(),
        responsible: "Gabriela",
        notes: "Continuar amanhã",
        items: [{ ...material, quantity: "", price: "", selected: true }],
      },
      "author@example.com",
    );
    const reopened = await getQuote(unfinished.id);
    assert.equal(reopened.responsible, "Gabriela");
    assert.equal(reopened.client, "");
    assert.equal(reopened.items[0].quantity, "");
    assert.equal(reopened.items[0].price, "");
    assert.equal(reopened.items[0].selected, true);
    const pendingList = await listQuotes("Gabriela");
    assert.equal(pendingList.length, 1);
    assert.equal(pendingList[0].pending_amounts, true);
    assert.equal(pendingList[0].responsible, "Gabriela");
    await db.exec("SET ROLE anon");
    await assert.rejects(() => db.query("SELECT * FROM web_quotes"));
    await db.exec("RESET ROLE");
  } finally {
    globals.historyPool = previous;
    await db.close();
  }
});

test("quotation ordering prioritizes genuine, similar and newest sales without inventing matches", () => {
  const make = (key: string, source: string): QuoteItem => ({
    ...material,
    key,
    source,
  });
  const oldGenuine = make("old", "Referência fabricante (Genuína)");
  const newGenuine = make("new", "Referência fabricante (Genuína)");
  const similar = make("sim", "Código de similaridade");
  const unknown = make("unknown", "Histórico");
  const histories: any = {
    old: { rows: [{ date: "2025-01-01" }] },
    new: { rows: [{ date: "2026-01-01" }] },
    sim: { rows: [{ date: "2026-09-01" }] },
  };
  assert.deepEqual(
    [similar, oldGenuine, unknown, newGenuine]
      .sort((a, b) => compareQuoteItems(a, b, histories))
      .map((i) => i.key),
    ["new", "old", "sim", "unknown"],
  );
});

test("draft rejects duplicate ERP products across lists, companies and units", () => {
  const first = { ...material, key: "p:1:5:UN", code: "5", selected: true };
  const second = { ...first, key: "p:2:5:CX", unit: "CX" };
  assert.throws(
    () => parseQuote({ ...blankQuote(), items: [first, second] }),
    /mais de uma vez/,
  );
  assert.doesNotThrow(() =>
    parseQuote({
      ...blankQuote(),
      items: [first, { ...second, selected: false }],
    }),
  );
  assert.doesNotThrow(() =>
    parseQuote({
      ...blankQuote(),
      items: [first, { ...second, kind: "service" }],
    }),
  );
});
