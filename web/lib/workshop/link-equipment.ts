import 'server-only';
/** Match the equipment screen: local inactivation or all preferred ERP client links inactive. */
export const linkableEquipmentSql=`NOT EXISTS (
 SELECT 1 FROM web_equipment_settings s WHERE s.equipment_id=e.equipment_id AND s.document ? 'inactivation'
) AND NOT COALESCE((
 SELECT bool_and(COALESCE(latest.payload->'ativo'='false'::jsonb,false)) FROM (
  SELECT DISTINCT ON(person_id) payload FROM m8_person_equipment
  WHERE equipment_id=e.equipment_id AND present
  ORDER BY person_id,(company_id=1) DESC,collected_at DESC,company_id
 ) latest
),false)`;
export async function linkableEquipment(db:any,id:string){
 return (await db.query(`SELECT e.equipment_id::text id,e.name,e.serial FROM m8_equipment_catalog e WHERE e.equipment_id=$1 AND e.present AND ${linkableEquipmentSql} FOR SHARE OF e`,[id])).rows[0];
}
