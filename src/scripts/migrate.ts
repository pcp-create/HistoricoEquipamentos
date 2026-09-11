import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { connectDatabase, transaction } from '../database/postgres.js';
import { log, SafeError, safeError } from '../utils/logger.js';
async function main() {
  const db = await connectDatabase();
  try {
    await db.query('SELECT pg_advisory_lock(81008, 0)');
    await db.query(`CREATE TABLE IF NOT EXISTS public.integracao_m8_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    await db.query('ALTER TABLE public.integracao_m8_migrations ENABLE ROW LEVEL SECURITY');
    await db.query('REVOKE ALL ON public.integracao_m8_migrations FROM PUBLIC');
    for (const name of ['001_m8_history.sql', '002_m8_observed_types.sql', '003_m8_id_scan.sql', '004_m8_approval_mixed.sql', '005_m8_collection_cycle.sql', '006_m8_product_stock.sql', '007_m8_product_lookup.sql', '008_m8_equipment_registry.sql', '009_m8_equipment_link_safety.sql']) {
      const sql = await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      await transaction(db, async () => {
        const { rows } = await db.query<{ checksum: string }>('SELECT checksum FROM public.integracao_m8_migrations WHERE name=$1', [name]);
        if (rows[0]) {
          if (rows[0].checksum !== checksum) throw new SafeError('Migration aplicada foi alterada; crie uma nova migration');
          log('DB', 'Migration já aplicada'); return;
        }
        await db.query(sql);
        await db.query('INSERT INTO public.integracao_m8_migrations (name,checksum) VALUES ($1,$2)', [name, checksum]);
        log('DB', 'Migration aplicada', { migration: name });
      });
    }
  } finally { await db.end(); }
}
await main().catch(error => { log('DB', safeError(error)); process.exitCode = 1; });
