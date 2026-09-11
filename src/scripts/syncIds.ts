import { m8Config, integer } from '../config/env.js';
import { connectDatabase } from '../database/postgres.js';
import { IntegrationRepository } from '../database/integracaoLog.repository.js';
import { M8Client } from '../m8/client.js';
import { scanIds } from '../sync/idScan.js';
import { log, SafeError, safeError } from '../utils/logger.js';
let stop = false;
process.on('SIGINT', () => { stop = true; });
process.on('SIGTERM', () => { stop = true; });
async function main() {
  const config = m8Config();
  const flags = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--(from-id|to-id|max-ids)=(\d+)$/.exec(arg);
    if (!match || flags.has(match[1]!)) throw new SafeError('Use --from-id=1 --to-id=14681 [--max-ids=10]');
    flags.set(match[1]!, match[2]!);
  }
  if (!flags.has('to-id')) throw new SafeError('Informe --to-id com o maior ID confirmado no ERP');
  const options = {
    fromId: integer(flags.get('from-id'), 1, 'from-id'), toId: integer(flags.get('to-id'), 0, 'to-id'),
    maxIds: flags.has('max-ids') ? integer(flags.get('max-ids'), 1, 'max-ids') : undefined,
    shouldStop: () => stop,
  };
  // Independent connections/locks, one in-flight HTTP request per company.
  await Promise.all(config.companies.map(async company => {
    let db;
    try {
      db = await connectDatabase();
      await scanIds(new M8Client(config, company), new IntegrationRepository(db), options);
    } catch (error) { log('ID_SCAN', safeError(error), { company }); process.exitCode = 1; }
    finally { await db?.end(); }
  }));
}
await main().catch(error => { log('ID_SCAN', safeError(error)); process.exitCode = 1; });
