import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query(
    readFileSync(
      new URL("../sql/105_equipment_relation_integration.sql", import.meta.url),
      "utf8",
    ).replace("BEGIN;", "BEGIN READ WRITE;"),
  );
  console.log("Estrutura de integração de vínculos e inativações conferida.");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await db.end();
}
