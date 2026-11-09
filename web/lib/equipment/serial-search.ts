import "server-only";
import { database } from "../db";
import { normalizedEquipmentSerial } from "./serial";
export async function serialCandidates(serial: string, db: any = database()) {
  const key = normalizedEquipmentSerial(serial);
  if (!key) return [];
  return (
    await db.query(
      `SELECT e.equipment_id::text id,e.name,e.model,e.serial,
 web_equipment_serial_key(e.serial)=$1 AS exact,
 (SELECT string_agg(DISTINCT p.person_name,', ') FROM web_effective_person_equipment p WHERE p.equipment_id=e.equipment_id) client
 FROM m8_equipment_catalog e WHERE e.present AND (
 web_equipment_serial_key(e.serial)=$1 OR
 (length($1)>=4 AND web_equipment_serial_key(e.serial) LIKE '%'||$1||'%'))
 ORDER BY exact DESC,e.equipment_id LIMIT 15`,
      [key],
    )
  ).rows;
}
