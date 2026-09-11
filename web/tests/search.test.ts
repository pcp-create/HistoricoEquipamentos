import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { buildWhere } from "../lib/history";
import { parseFilters, csvCell } from "../lib/filters";

test("filters reject invalid dates, company, page and too many terms", () => {
  for (const query of [
    "from=2026-02-30",
    "company=3",
    "orderNumber=OS-",
    "orderNumber=12abc",
    "orderNumber=-1",
    "orderNumber=9223372036854775808",
    "page=-2",
    "from=2026-03-02&to=2026-03-01",
    `q=${"a ".repeat(13)}`,
  ])
    assert.throws(() => parseFilters(new URLSearchParams(query)));
  assert.equal(parseFilters(new URLSearchParams("size=500000")).size, 25);
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});
test("global search uses values, respects each material and updates with the integrator", async () => {
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
    await db.exec(
      readFileSync(new URL("../sql/001_search.sql", import.meta.url), "utf8"),
    );
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,cliente_nome,equipamento,observacao,emissao,payload) VALUES
 (1,1,'Águia Indústria','Compressor','Vedação especial','2026-09-11T02:00:00Z','{}'),
 (2,1,'Outro Cliente','Gerador','Referência 100%_OK','2026-09-11T04:00:00Z','{}');
 INSERT INTO m8_os_produtos(company_id,ordem_servico_id,id_m8,produto_nome,referencia_fabricante,quantidade,esta_excluido,payload) VALUES
 (1,1,7,'Filtro de óleo','ABC-123',2,false,'{}'),(1,1,8,'Correia','ZZ-42',1,false,'{}'),(2,1,7,'Peça excluída','EXCLUIDO',1,true,'{}');
 INSERT INTO m8_equipamentos(company_id,ordem_servico_id,id_m8,numero_serie,problema,payload) VALUES (1,1,1,'SN001','ruído','{}'),(1,1,2,'SN002','vibração','{}');`);
    await db.exec(
      readFileSync(
        new URL("../sql/003_include_excluded_materials.sql", import.meta.url),
        "utf8",
      ),
    );
    async function results(query: string) {
      const f = parseFilters(new URLSearchParams(query));
      const { sql, values } = buildWhere(f);
      const r = await db.query(
        `SELECT o.company_id,o.id_m8 ${f.view === "materials" ? ",p.id_m8 AS item" : ""} FROM m8_ordens_servico o ${f.view === "materials" ? "JOIN m8_os_produtos p ON p.company_id=o.company_id AND p.ordem_servico_id=o.id_m8 " : ""} WHERE ${sql}`,
        values,
      );
      return r.rows as { company_id: number; item?: number }[];
    }
    await db.exec(
      "UPDATE m8_ordens_servico SET numero_sequencia=1254 WHERE company_id=1 AND id_m8=1",
    );
    assert.equal((await results("orderNumber=OS-001254&company=1")).length, 1);
    assert.equal((await results("orderNumber=125&company=1")).length, 0);
    assert.equal((await results("orderNumber=1&company=1")).length, 0);
    assert.equal((await results("orderNumber=1&company=2")).length, 1);
    assert.equal(
      (await results("orderNumber=1254&company=1&view=materials")).length,
      2,
    );
    assert.equal((await results("exactSerial=SN-002&company=1")).length, 1);
    assert.equal((await results("exactSerial=SN00&company=1")).length, 0);
    assert.equal((await results("exactSerial=SN002&company=2")).length, 0);
    assert.equal((await results("q=aguia filtro SN002")).length, 1);
    assert.equal((await results("q=vedacao")).length, 1);
    assert.equal((await results("q=ruido")).length, 1);
    assert.equal((await results("q=EXCLUIDO")).length, 1);
    assert.equal(
      (await results("q=cliente_nome")).length,
      0,
      "column names are not search values",
    );
    assert.equal(
      (await results("q=10/09/2026")).length,
      1,
      "Brasilia date indexed",
    );
    assert.equal(
      (await results("from=2026-09-11&to=2026-09-11"))[0].company_id,
      2,
      "date filter uses Brasilia",
    );
    assert.equal((await results("q=filtro&company=2")).length, 0);
    await db.exec(
      "UPDATE m8_os_produtos SET produto_id=CASE WHEN id_m8=7 THEN 700 ELSE 7000 END",
    );
    assert.deepEqual(
      (await results("view=materials&productId=700&company=1")).map(
        (r) => r.item,
      ),
      [7],
      "analysis drill-down uses exact IDs, not partial code matches",
    );
    assert.equal(
      (await results("view=materials&productId=700&company=2")).length,
      1,
    );
    assert.throws(() =>
      parseFilters(new URLSearchParams("productId=700 OR 1=1")),
    );
    assert.deepEqual(
      (await results("q=filtro&view=materials")).map((r) => r.item),
      [7],
    );
    assert.equal(
      (await results("q=aguia&view=materials")).length,
      2,
      "equipment rows do not multiply products",
    );
    assert.equal(
      (await results("q=100%25_OK")).length,
      1,
      "wildcards treated literally",
    );
    assert.equal(
      (await results("q=' OR 1=1 --")).length,
      0,
      "query is parameterized",
    );
    await db.exec(
      "UPDATE m8_os_produtos SET produto_nome='Elemento novo' WHERE company_id=1 AND id_m8=7",
    );
    assert.equal((await results("q=filtro")).length, 0);
    assert.equal((await results("q=elemento")).length, 1);
    await db.exec(
      "UPDATE m8_os_produtos SET esta_excluido=true WHERE company_id=1 AND id_m8=7",
    );
    assert.equal((await results("q=elemento")).length, 1);
    await db.exec(
      "INSERT INTO m8_ordens_servico(company_id,id_m8,payload) VALUES(1,2,'{}'); INSERT INTO m8_os_produtos(company_id,ordem_servico_id,id_m8,produto_nome,payload) VALUES(1,2,8,'Outro item','{}')",
    );
    assert.equal(
      (await results("q=correia")).length,
      1,
      "child IDs can repeat in different orders",
    );
    await db.exec(
      "DELETE FROM m8_os_produtos WHERE company_id=1 AND ordem_servico_id=2 AND id_m8=8",
    );
    assert.equal((await results("q=outro item")).length, 0);
    assert.equal((await results("q=correia")).length, 1);
  } finally {
    await db.close();
  }
});
