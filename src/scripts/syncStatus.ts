import { connectDatabase } from '../database/postgres.js';
import { log, safeError } from '../utils/logger.js';
async function main() {
  const db = await connectDatabase();
  try {
    const { rows } = await db.query(`SELECT company_id,count(*)::int AS ordens,
      count(*) FILTER(WHERE pending)::int AS pendentes,
      count(*) FILTER(WHERE finalized)::int AS finalizadas,
      count(*) FILTER(WHERE error IS NOT NULL)::int AS erros,
      max(last_detail_at) AS ultima_coleta FROM public.integracao_m8_os_sync GROUP BY company_id ORDER BY company_id`);
    for (const row of rows) log('STATUS','Estado da sincronização', {
      company: row.company_id, orders: row.ordens, pending: row.pendentes,
      finalized: row.finalizadas, errors: row.erros, lastDetail: row.ultima_coleta?.toISOString() ?? null,
    });
  } finally { await db.end(); }
}
await main().catch(error => { log('STATUS',safeError(error));process.exitCode=1; });
