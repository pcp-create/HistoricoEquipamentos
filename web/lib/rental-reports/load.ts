import "server-only";
import { database } from "../db";
import { rentalStatuses } from "../equipment-management/rental-status";
import { buildRentalReport, type Kind } from "./report";
export async function loadRentalReport(kind: Kind) {
  const rows = (
    await database().query(
      `SELECT e.equipment_id::text id,e.name,e.serial,COALESCE(NULLIF(trim(e.payload->>'codigoIdentificacaoInterno'),''),(SELECT NULLIF(trim(p.payload->>'codigoIdentificacaoInterno'),'') FROM m8_product_catalog p WHERE p.product_id=e.equipment_id AND p.company_id IN(1,2,27404) AND NULLIF(trim(p.payload->>'codigoIdentificacaoInterno'),'') IS NOT NULL ORDER BY (p.company_id=1) DESC,p.collected_at DESC NULLS LAST,p.company_id LIMIT 1)) internal_code FROM m8_equipment_catalog e WHERE e.present AND e.payload->>'familiaId'='3' ORDER BY e.equipment_id`,
    )
  ).rows;
  const statuses = await rentalStatuses(rows.map((r) => r.id));
  return buildRentalReport(
    rows.map((r) => ({ ...r, rentalStatus: statuses.get(r.id) || null })),
    kind,
  );
}
