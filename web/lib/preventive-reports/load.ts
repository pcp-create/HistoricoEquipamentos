import "server-only";
import { database } from "../db";
import { rentalUsage } from "../equipment-management/rental-usage";
import { buildReport, type ReportKind, type Source } from "./report";
export async function loadReport(kind: ReportKind) {
  const rows = (
    await database()
      .query(`SELECT e.equipment_id::text id,e.name,e.serial,COALESCE(e.payload->>'familiaId'='3',false) rental,COALESCE(s.document,'{}') settings,
 COALESCE((SELECT string_agg(DISTINCT p.person_name,' / ' ORDER BY p.person_name) FROM m8_person_equipment p WHERE p.equipment_id=e.equipment_id AND p.present),'Sem cliente vinculado') clients,
 COALESCE((SELECT jsonb_agg(p.document || jsonb_build_object('id',p.id) ORDER BY p.id) FROM web_equipment_plans p WHERE p.equipment_id=e.equipment_id AND NOT p.archived),'[]') plans
 FROM m8_equipment_catalog e LEFT JOIN web_equipment_settings s USING(equipment_id) WHERE e.present ORDER BY e.equipment_id`)
  ).rows;
  const usage = await rentalUsage(
    rows.filter((e) => e.rental).map((e) => e.id),
  );
  return buildReport(
    rows.map((e) => ({ ...e, usage: usage.get(e.id) })) as Source[],
    kind,
  );
}
