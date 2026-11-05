import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query("BEGIN READ WRITE");
  await c.query(
    readFileSync(
      new URL("../sql/097_visit_equipment_inactivation.sql", import.meta.url),
      "utf8",
    ),
  );
  await c.query("COMMIT");
  console.log("Inativação de equipamentos no portal de visitas configurada.");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await db.end();
}
