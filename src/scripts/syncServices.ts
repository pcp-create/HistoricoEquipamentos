import { m8Config } from '../config/env.js';
import { connectDatabase } from '../database/postgres.js';
import { M8Client } from '../m8/client.js';
import { syncServices } from '../sync/serviceCatalog.js';
import { log, safeError } from '../utils/logger.js';
async function main() {
  const config = m8Config();
  for (const company of config.companies) {
    const db = await connectDatabase();
    try { await syncServices(new M8Client(config, company), db); }
    finally { await db.end(); }
  }
}
await main().catch(error => { log('SERVICOS', safeError(error)); process.exitCode = 1; });
