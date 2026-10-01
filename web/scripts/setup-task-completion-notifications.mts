import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { database } from "../lib/db";
const db = database(),
  c = await db.connect();
try {
  await c.query("BEGIN READ WRITE");
  await c.query("SELECT pg_advisory_xact_lock(81018,41)");
  const name = "041_task_completion_notifications.sql",
    sql = readFileSync(new URL("../sql/" + name, import.meta.url), "utf8"),
    checksum = createHash("sha256").update(sql).digest("hex");
  const old = (
    await c.query("SELECT checksum FROM web_history_migrations WHERE name=$1", [
      name,
    ])
  ).rows[0];
  if (old && old.checksum !== checksum)
    throw Error("Migration existente diverge");
  if (!old) {
    await c.query(sql);
    await c.query(
      "INSERT INTO web_history_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
  }
  await c.query("COMMIT");
  console.log("Notificações de conclusão preparadas.");
} catch {
  await c.query("ROLLBACK");
  console.error("Não foi possível preparar as notificações de conclusão.");
  process.exitCode = 1;
} finally {
  c.release();
  await db.end();
}
