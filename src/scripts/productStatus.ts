import { connectDatabase } from '../database/postgres.js';
import { log, safeError } from '../utils/logger.js';
async function main() {
  const db = await connectDatabase();
  try {
    const { rows } =
      await db.query(`SELECT c.company_id,count(*)::int AS catalog,count(*)::int AS monitored,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM m8_os_produtos p WHERE p.company_id=c.company_id AND p.produto_id=c.product_id))::int AS with_os_history,
 count(*) FILTER(WHERE v.stock_at IS NULL)::int AS stock_missing,
 count(*) FILTER(WHERE v.available_at IS NULL)::int AS available_missing,
 count(*) FILTER(WHERE v.stock_at IS NOT NULL)::int AS stock_collected,
 count(*) FILTER(WHERE v.available_at IS NOT NULL)::int AS available_collected,
 count(*) FILTER(WHERE v.available_at>now()-interval '15 minutes')::int AS available_recent,
 min(v.stock_at) AS oldest_stock,max(v.stock_at) AS newest_stock,
 (SELECT success_at FROM m8_product_sync s WHERE s.company_id=c.company_id AND s.mode='catalog') AS catalog_checked
 FROM m8_product_catalog c LEFT JOIN m8_product_current v USING(company_id,product_id) GROUP BY c.company_id ORDER BY c.company_id`);
    for (const row of rows)
      log('PRODUTOS_STATUS', 'Cobertura e atualização', row);
  } finally {
    await db.end();
  }
}
await main().catch((error) => {
  log('PRODUTOS_STATUS', safeError(error));
  process.exitCode = 1;
});
