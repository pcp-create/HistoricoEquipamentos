import { connectDatabase } from "../database/postgres.js";
import { log, safeError } from "../utils/logger.js";
const db = await connectDatabase();
try {
  const r = await db.query(`SELECT s.*,
 (SELECT count(*)::int FROM m8_equipment_catalog WHERE present) AS catalog,
 (SELECT count(*)::int FROM m8_person_equipment p WHERE p.company_id=s.company_id AND p.present) AS person_links,
 (SELECT count(*)::int FROM m8_equipment_person_queue q WHERE q.company_id=s.company_id AND checked_at IS NULL) AS not_checked,
 (SELECT count(*)::int FROM m8_equipment_person_queue q WHERE q.company_id=s.company_id AND error IS NOT NULL) AS failures,
 (SELECT count(*)::int FROM m8_equipment_linked l WHERE l.company_id=s.company_id) AS linked,
 (SELECT count(*)::int FROM m8_order_equipment_links l WHERE l.company_id=s.company_id AND method='review') AS review
 FROM m8_equipment_sync s ORDER BY s.company_id`);
  for (const row of r.rows)
    log("EQUIPAMENTOS", "Cobertura do cadastro e cruzamento", row);
} catch (error) {
  log("EQUIPAMENTOS", safeError(error));
  process.exitCode = 1;
} finally {
  await db.end();
}
