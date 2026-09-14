import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  getOrderProfit,
  saveOrderProfit,
  ProfitConflict,
} from "../lib/order-profit-store";
test("profit is persisted per company/OS, server-calculated and protected against concurrent overwrite", async () => {
  const db = new PGlite();
  const globals = globalThis as unknown as { historyPool: unknown };
  const previous = globals.historyPool;
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE m8_ordens_servico(company_id bigint,id_m8 bigint,total_geral numeric); INSERT INTO m8_ordens_servico VALUES(1,14611,1000),(2,14611,2000);",
    );
    await db.exec(
      readFileSync(
        new URL("../sql/006_order_profit.sql", import.meta.url),
        "utf8",
      ),
    );
    const query = db.query.bind(db);
    globals.historyPool = {
      query,
      connect: async () => ({ query, release() {} }),
    };
    assert.equal(await getOrderProfit("1", "14611"), null);
    const first = await saveOrderProfit(
      "1",
      "14611",
      {
        materials: "300",
        hours: "2",
        version: null,
        revenue: 99999,
        profit: 99999,
      },
      "test@example.com",
      "Maick Coelho",
    );
    assert.equal(first.document.calculated_by_name, "Maick Coelho");
    assert.equal(first.calculated_by, "test@example.com");
    assert.equal(first.document.profit, 620);
    assert.equal(first.document.labor, 80);
    const saved = await getOrderProfit("1", "14611");
    assert.equal(saved.document.profit, 620);
    assert.equal(await getOrderProfit("2", "14611"), null);
    await assert.rejects(
      () =>
        saveOrderProfit(
          "1",
          "14611",
          { materials: "0", hours: "0", version: null },
          "other@example.com",
        ),
      ProfitConflict,
    );
    const second = await saveOrderProfit(
      "1",
      "14611",
      { materials: "400", hours: "3", version: 1 },
      "other@example.com",
    );
    assert.equal(second.document.profit, 480);
    assert.equal(second.version, 2);
    await assert.rejects(
      () =>
        saveOrderProfit(
          "1",
          "14611",
          { materials: "0", hours: "0", version: 1 },
          "test@example.com",
        ),
      ProfitConflict,
    );
    await assert.rejects(() =>
      saveOrderProfit(
        "1",
        "14611",
        { materials: "", hours: "2", version: 2 },
        "test@example.com",
      ),
    );
    await db.exec("SET ROLE anon");
    await assert.rejects(
      () => db.query("SELECT * FROM web_order_profit"),
      /permission denied/,
    );
  } finally {
    globals.historyPool = previous;
    await db.close();
  }
});
