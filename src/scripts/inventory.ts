import { m8Config } from '../config/env.js';
import { M8Client } from '../m8/client.js';
import { fetchInventory } from '../m8/inventory.js';
import { log, safeError } from '../utils/logger.js';
async function main() {
  const config = m8Config();
  const ids = new Set<string>();
  let largest = 0n;
  for (const company of config.companies) {
    const start = Date.now();
    const entries = await fetchInventory(new M8Client(config, company));
    let max = 0n, repeated = 0, duplicateRows = 0;
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      const n = BigInt(entry.id);
      if (n > max) max = n;
      if (n > largest) largest = n;
      if (ids.has(entry.id)) repeated++;
      ids.add(entry.id);
      duplicateRows += entry.occurrences - 1;
      const status = entry.status ?? 'DIVERGENTE';
      counts[status] = (counts[status] || 0) + 1;
    }
    log('INVENTARIO', 'Listagem resumida consultada', { company, idsDistintos: entries.length, linhasRepetidas: duplicateRows, maiorId: max.toString(), duracaoMs: Date.now() - start, idsRepetidosEntreEmpresas: repeated, ...counts });
  }
  log('INVENTARIO', 'Inventário concluído', { idsDistintos: ids.size, maiorId: largest.toString() });
}
await main().catch(error => { log('INVENTARIO', safeError(error)); process.exitCode = 1; });
