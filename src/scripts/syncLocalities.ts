import { m8Config, integer } from "../config/env.js";
import { connectDatabase } from "../database/postgres.js";
import { M8Client } from "../m8/client.js";
import { syncCustomerLocalities } from "../sync/customerLocalities.js";
import { log, safeError, SafeError } from "../utils/logger.js";
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((a) => !/^--max-people=\d+$/.test(a)))
    throw new SafeError("Use [--max-people=100]");
  const maxPeople = integer(args[0]?.split("=")[1], 100, "max-people", 10000);
  const config = m8Config(),
    db = await connectDatabase();
  try {
    if (!stopped) {
      const result = await syncCustomerLocalities(new M8Client(config, 1), db, {
        maxPeople,
        shouldStop: () => stopped,
      });
      if (result.failures) process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}
await main().catch((error) => {
  log("LOCALIDADES", safeError(error));
  process.exitCode = 1;
});
