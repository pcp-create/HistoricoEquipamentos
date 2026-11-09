import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  client = await db.connect();
try {
  await client.query(
    readFileSync(
      new URL("../sql/103_equipment_customer_links.sql", import.meta.url),
      "utf8",
    ).replace("BEGIN;", "BEGIN READ WRITE;"),
  );
  console.log("Estrutura de vínculos locais de equipamentos verificada.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await db.end();
}
