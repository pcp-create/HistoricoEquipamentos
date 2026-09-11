import { m8Config, integer } from '../config/env.js';
import { connectDatabase } from '../database/postgres.js';
import { IntegrationRepository } from '../database/integracaoLog.repository.js';
import { M8Client } from '../m8/client.js';
import { collectionCycle } from '../sync/collectionCycle.js';
import { log, SafeError, safeError } from '../utils/logger.js';
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
async function main() {
  const config = m8Config();
  let maxOrders: number | undefined, resumeOnly = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--resume' && !resumeOnly) resumeOnly = true;
    else if (/^--max-orders=\d+$/.test(arg) && maxOrders === undefined) maxOrders = integer(arg.split('=')[1], 1, 'max-orders');
    else throw new SafeError('Use [--max-orders=10] [--resume]');
  }
  await Promise.all(config.companies.map(async company => {
    let db;
    try {
      db = await connectDatabase();
      const result = await collectionCycle(new M8Client(config,company),new IntegrationRepository(db), { maxOrders,resumeOnly,shouldStop:()=>stopped });
      if (result.failures) process.exitCode = 1;
    } catch (error) { log('CICLO',safeError(error),{company});process.exitCode=1; }
    finally { await db?.end(); }
  }));
}
await main().catch(error=>{log('CICLO',safeError(error));process.exitCode=1;});
