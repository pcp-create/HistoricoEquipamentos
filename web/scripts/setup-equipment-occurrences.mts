import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query("BEGIN READ WRITE");
  await c.query(
    readFileSync(
      new URL("../sql/094_equipment_occurrences.sql", import.meta.url),
      "utf8",
    ),
  );
  await c.query("COMMIT");
  console.log("Boletins de ocorrência de equipamentos configurados.");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await db.end();
}
