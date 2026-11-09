import 'server-only';
import {equipmentInactivations} from './equipment-inactivation';
export async function customerEquipment(db:any,key:string){
 if(!/^(m8:\d+|lead:[0-9a-f-]{36})$/i.test(key))return [];
 const rows=(await db.query(`SELECT DISTINCT p.equipment_id::text AS id,p.integration_pending,coalesce(e.name,'Equipamento') AS name,coalesce(e.model,'') AS model,coalesce(e.serial,'') AS serial FROM web_effective_person_equipment p JOIN m8_equipment_catalog e ON e.equipment_id=p.equipment_id WHERE p.present AND p.customer_key=$1 ORDER BY id`,[key])).rows;
 const inactive=await equipmentInactivations(db);
 return rows.map((row:any)=>({...row,inactivation:inactive.find((i:any)=>i.customer_key===key&&i.equipment_key===row.id)}));
}
