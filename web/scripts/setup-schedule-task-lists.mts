import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query(
    readFileSync(
      new URL("../sql/059_schedule_task_lists.sql", import.meta.url),
      "utf8",
    ).replace("BEGIN;", "BEGIN READ WRITE;"),
  );
  console.log("Estrutura de listas de tarefas criada/verificada.");
} catch (error) {
  await c.query("ROLLBACK");
  throw error;
} finally {
  c.release();
  await db.end();
}
