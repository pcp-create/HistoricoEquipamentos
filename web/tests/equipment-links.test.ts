import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { history, orderDetail } from "../lib/history";
import { parseFilters } from "../lib/filters";
import { quoteSuggestions, quoteLookup } from "../lib/quotes/suggestions";
import { equipmentConsumption } from "../lib/manufacturer/catalog";
test("linked equipment enriches blank OS, searches and cross-company quotes while review-only matches remain excluded", async () => {
  const db = new PGlite(),
    globals = globalThis as unknown as { historyPool: unknown },
    before = globals.historyPool;
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated");
    for (const n of readdirSync(
      new URL("../../supabase/migrations/", import.meta.url),
    )
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/" + n, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      readFileSync(new URL("../sql/001_search.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      readFileSync(
        new URL("../sql/004_manufacturer.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(`INSERT INTO m8_equipment_catalog(company_id,equipment_id,name,model,serial,serial_source,payload,collected_at) VALUES(1,10,'Compressor cadastrado','GA15','BRP123456','nome','{}',now());
    INSERT INTO m8_customer_directory(company_id,person_id,name,payload,collected_at) VALUES(1,7,'Cliente novo','{}',now());
    INSERT INTO m8_person_equipment(company_id,person_id,link_id,equipment_id,payload,collected_at) VALUES(1,7,1,10,'{}',now());
    INSERT INTO m8_product_catalog(company_id,product_id,name,unit,sale_price,minimum_price,payload,collected_at) VALUES(1,6,'Correia','UN',17,10,'{}',now()),(2,6,'Correia','UN',999,800,'{}',now());
    INSERT INTO m8_ordens_servico(company_id,id_m8,cliente_id,status,payload) VALUES(1,1,7,'Processado','{}'),(2,1,7,'Processado','{}'),(27404,1,7,'Processado','{}');
    INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,finalized,pending,last_detail_at) SELECT company_id,id_m8,now(),true,false,now() FROM m8_ordens_servico;
    INSERT INTO m8_os_produtos(company_id,ordem_servico_id,id_m8,produto_id,produto_nome,quantidade,unidade_nome,valor_total,payload) VALUES(1,1,1,5,'Filtro',1,'UN',10,'{}'),(2,1,1,6,'Correia',1,'UN',20,'{}'),(27404,1,1,7,'Não confirmado',1,'UN',30,'{}');
    INSERT INTO m8_order_equipment_links(company_id,order_id,equipment_id,method,evidence) VALUES(1,1,10,'observation','{"value":"BRP123456"}'),(2,1,10,'explicit','{}'),(27404,1,10,'review','{}');`);
    globals.historyPool = db;
    const result = await history(
      parseFilters(new URLSearchParams("exactSerial=BRP123456")),
    );
    assert.equal(result.total, 2);
    assert.equal(result.rows[0].equipment, "Compressor cadastrado");
    assert.equal(
      (await history(parseFilters(new URLSearchParams("model=GA15")))).total,
      2,
    );
    assert.equal(
      (await history(parseFilters(new URLSearchParams("q=cadastrado")))).total,
      2,
    );
    const detail = await orderDetail("27404", "1");
    assert.equal(detail.equipment_links[0].method, "review");
    assert.equal((await equipmentConsumption("1", "BRP123456")).inferred, 1);
    const suggested = await quoteSuggestions(
      new URLSearchParams("clientId=7&equipmentId=10"),
    );
    assert.equal(suggested.items.length, 2);
    assert.equal(
      suggested.items.find((i) => i.code === "6")?.referencePrice,
      "17",
    );
    assert(!suggested.items.some((i) => i.name === "Não confirmado"));
    const lookup = await quoteLookup(
      new URLSearchParams("lookup=equipment&clientId=7"),
    );
    assert(lookup.rows?.some((e) => e.equipment_id === "10"));
    const clients = await quoteLookup(
      new URLSearchParams("lookup=clients&q=novo"),
    );
    assert.equal(clients.rows?.length, 1);
  } finally {
    globals.historyPool = before;
    await db.close();
  }
});
