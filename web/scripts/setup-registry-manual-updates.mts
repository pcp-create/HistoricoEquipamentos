import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query(
    readFileSync(
      new URL("../sql/062_registry_manual_updates.sql", import.meta.url),
      "utf8",
    ).replace("BEGIN;", "BEGIN READ WRITE;"),
  );
  console.log("Registro de atualizações manuais criada/verificada.");
} catch (error) {
  await c.query("ROLLBACK");
  throw error;
} finally {
  c.release();
  await db.end();
}
