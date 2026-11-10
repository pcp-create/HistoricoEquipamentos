import 'server-only';
import {equipmentInactivations} from './equipment-inactivation';
export async function customerEquipment(db:any,key:string){
 if(!/^(m8:\d+|lead:[0-9a-f-]{36})$/i.test(key))return [];
 const rows=(await db.query(`SELECT DISTINCT p.equipment_id::text AS id,p.integration_pending,coalesce(e.name,'Equipamento') AS name,coalesce(e.model,'') AS model,coalesce(e.serial,'') AS serial,CASE WHEN jsonb_typeof(p0.payload->'ativo')='boolean' THEN (p0.payload->>'ativo')::boolean END erp_active,p0.payload->>'motivoInativacao' erp_reason,p0.collected_at erp_at FROM web_effective_person_equipment p JOIN m8_equipment_catalog e ON e.equipment_id=p.equipment_id LEFT JOIN LATERAL(SELECT payload,collected_at FROM m8_person_equipment x WHERE x.equipment_id=p.equipment_id AND 'm8:'||x.person_id::text=p.customer_key AND x.present ORDER BY (x.company_id=1) DESC,x.collected_at DESC LIMIT 1)p0 ON true WHERE p.present AND p.customer_key=$1 ORDER BY id`,[key])).rows;
 const inactive=await equipmentInactivations(db);
 return rows.map((row:any)=>({...row,inactivation:row.erp_active===false?{reason:row.erp_reason||'Motivo não informado no ERP',created_at:row.erp_at,actor:'ERP M8',source:'m8'}:inactive.find((i:any)=>i.customer_key===key&&i.equipment_key===row.id&&i.integration_status!=='confirmed')}));
}
