import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query("BEGIN READ WRITE");
  await c.query(
    readFileSync(
      new URL("../sql/098_multiple_order_links.sql", import.meta.url),
      "utf8",
    ),
  );
  await c.query("COMMIT");
  console.log("Vínculos múltiplos de OS configurados.");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await db.end();
}
