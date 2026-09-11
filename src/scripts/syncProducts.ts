import { m8Config, integer } from '../config/env.js';
import { connectDatabase } from '../database/postgres.js';
import { M8Client } from '../m8/client.js';
import { syncProducts, type ProductMode } from '../sync/productStock.js';
import { syncServices } from '../sync/serviceCatalog.js';
import { log, safeError, SafeError } from '../utils/logger.js';
let stopped = false;
process.on('SIGTERM', () => {
  stopped = true;
});
process.on('SIGINT', () => {
  stopped = true;
});
async function main() {
  const mode = process.argv[2] as ProductMode;
  if (!['catalog', 'available', 'detail'].includes(mode))
    throw new SafeError('Use catalog, available ou detail [--max-products=N]');
  const extra = process.argv.slice(3);
  if (extra.length > 1 || (extra[0] && !/^--max-products=\d+$/.test(extra[0])))
    throw new SafeError('Argumento inválido');
  const maxProducts = extra[0]
    ? integer(extra[0].split('=')[1], 1, 'max-products')
    : undefined;
  const config = m8Config();
  for (const company of config.companies) {
    if (stopped) break;
    let db;
    try {
      db = await connectDatabase();
      const client = new M8Client(config, company);
      const result = await syncProducts(
        client,
        db,
        mode,
        { maxProducts, shouldStop: () => stopped },
      );
      if (result.failures) process.exitCode = 1;
      if (mode === 'catalog' && !stopped) await syncServices(client, db);
    } catch (error) {
      log('PRODUTOS', safeError(error), { company, mode });
      process.exitCode = 1;
    } finally {
      await db?.end();
    }
  }
}
await main().catch((error) => {
  log('PRODUTOS', safeError(error));
  process.exitCode = 1;
});
