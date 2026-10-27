import { m8Config } from "../config/env.js";
import { connectDatabase } from "../database/postgres.js";
import { M8Client } from "../m8/client.js";
import {
  commercialEndpoints,
  syncCommercialFacts,
  type CommercialKind,
} from "../sync/commercialFacts.js";
import { log, safeError, SafeError } from "../utils/logger.js";
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
async function main() {
  if (process.argv.length > 2)
    throw new SafeError("Este comando não recebe argumentos");
  const config = m8Config(),
    db = await connectDatabase();
  try {
    // Manual and scheduled runs serialize instead of failing on a collection lock.
    await db.query("SET statement_timeout=0");
    await db.query("SELECT pg_advisory_lock(81045,3)");
    await db.query("SET statement_timeout=120000");
    for (const company of [1, 2, 27404]) {
      const client = new M8Client(config, company);
      for (const kind of Object.keys(commercialEndpoints) as CommercialKind[]) {
        if (stopped) return;
        try {
          log(
            "COMERCIAL",
            "Coleta concluída",
            await syncCommercialFacts(client, db, kind, () => stopped),
          );
        } catch (error) {
          log("COMERCIAL", safeError(error), { company, kind });
          process.exitCode = 1;
        }
      }
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(81045,3)").catch(() => undefined);
    await db.end();
  }
}
await main().catch((error) => {
  log("COMERCIAL", safeError(error));
  process.exitCode = 1;
});
