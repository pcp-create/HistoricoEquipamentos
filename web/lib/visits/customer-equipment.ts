import 'server-only';
export async function customerEquipment(db:any,key:string){
 if(!/^m8:\d+$/.test(key))return [];
 return (await db.query(`SELECT DISTINCT p.equipment_id::text AS id,coalesce(e.name,'Equipamento') AS name,coalesce(e.model,'') AS model,coalesce(e.serial,'') AS serial FROM m8_person_equipment p JOIN m8_equipment_catalog e ON e.equipment_id=p.equipment_id WHERE p.present AND p.person_id=$1 ORDER BY id`,[key.slice(3)])).rows;
}
