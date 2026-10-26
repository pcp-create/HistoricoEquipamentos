import { connectDatabase } from "../database/postgres.js";
import { log, safeError } from "../utils/logger.js";
async function main() {
  const db = await connectDatabase();
  try {
    log(
      "CLIENTES",
      "Fila",
      (
        await db.query(
          `SELECT count(*)::int AS total,count(*) FILTER(WHERE checked_at IS NULL)::int AS never_checked,count(*) FILTER(WHERE next_at<=now())::int AS due,count(*) FILTER(WHERE error IS NOT NULL)::int AS failures,max(checked_at) AS last_checked FROM m8_customer_commercial_queue`,
        )
      ).rows[0],
    );
    for (const row of (
      await db.query(
        "SELECT error,count(*)::int AS count FROM m8_customer_commercial_queue WHERE error IS NOT NULL GROUP BY error ORDER BY count(*) DESC LIMIT 10",
      )
    ).rows)
      log("CLIENTES", "Falhas da fila", row);
    for (const row of (
      await db.query(
        `SELECT s.company_id,s.kind,s.collected_at,count(f.id) FILTER(WHERE f.present)::int AS present FROM m8_commercial_facts_sync s LEFT JOIN m8_commercial_facts f USING(company_id,kind) GROUP BY s.company_id,s.kind,s.collected_at ORDER BY s.company_id,s.kind`,
      )
    ).rows)
      log("COMERCIAL", "Snapshot", row);
  } finally {
    await db.end();
  }
}
await main().catch((error) => {
  log("COMERCIAL", safeError(error));
  process.exitCode = 1;
});
