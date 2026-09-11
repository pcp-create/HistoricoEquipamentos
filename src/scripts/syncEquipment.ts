import { m8Config, integer } from "../config/env.js";
import { connectDatabase } from "../database/postgres.js";
import { M8Client } from "../m8/client.js";
import {
  collectEquipmentCatalog,
  syncEquipmentPeople,
} from "../sync/equipmentRegistry.js";
import { rebuildEquipmentLinks } from "../equipment/linker.js";
import { log, SafeError, safeError } from "../utils/logger.js";
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
async function main() {
  const config = m8Config(),
    args = process.argv.slice(2);
  let maxPeople = 100,
    relink = false;
  for (const a of args)
    if (/^--max-people=\d+$/.test(a))
      maxPeople = integer(a.split("=")[1], 100, "max-people", 10000);
    else if (a === "--relink") relink = true;
    else throw new SafeError("Use [--max-people=100] [--relink]");
  const db = await connectDatabase();
  try {
    if (!relink) {
      await db.query("SELECT pg_advisory_lock(81016,0)");
      try {
        await collectEquipmentCatalog(new M8Client(config, 1), db);
      } finally {
        await db.query("SELECT pg_advisory_unlock(81016,0)");
      }
    }
    for (const company of config.companies) {
      if (stopped) break;
      try {
        if (relink)
          log("EQUIPAMENTOS", "Cruzamento atualizado", {
            company,
            ...(await rebuildEquipmentLinks(db, company)),
          });
        else {
          const result = await syncEquipmentPeople(
            new M8Client(config, company),
            db,
            { maxPeople, shouldStop: () => stopped },
          );
          if (result.failures) process.exitCode = 1;
        }
      } catch (error) {
        log("EQUIPAMENTOS", safeError(error), { company });
        process.exitCode = 1;
      }
    }
  } finally {
    await db.end();
  }
}
await main().catch((error) => {
  log("EQUIPAMENTOS", safeError(error));
  process.exitCode = 1;
});
