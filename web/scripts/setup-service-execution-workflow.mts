import { readFileSync } from "node:fs";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query("BEGIN READ WRITE");
  await c.query(
    readFileSync(
      new URL("../sql/093_service_execution_workflow.sql", import.meta.url),
      "utf8",
    ),
  );
  await c.query("COMMIT");
  console.log(
    "Fluxo de execução, notificações e correções de aprovação configurados.",
  );
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await db.end();
}
