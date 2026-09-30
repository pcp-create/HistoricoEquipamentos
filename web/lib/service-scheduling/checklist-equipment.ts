import 'server-only';

/** Validate the current equipment without depending solely on the asynchronous link index.
 * Called within the checklist transaction; never infer a replacement from names or serials.
 */
export async function isChecklistEquipmentLinked(c:any,equipmentId:string,companyId:number,orderId:number){
 const equipment=(await c.query(`SELECT e.equipment_id,
  EXISTS(SELECT 1 FROM m8_order_equipment_links l WHERE l.equipment_id=e.equipment_id
   AND l.company_id=$2 AND l.order_id=$3 AND NOT l.stale) AS linked
  FROM m8_equipment_catalog e WHERE e.equipment_id=$1 AND e.present FOR UPDATE`,
  [equipmentId,companyId,orderId])).rows[0];
 if(!equipment)return false;
 if(equipment.linked)return true;
 // Synchronization marks the index stale before it is rebuilt. The explicit ERP ID
 // on the current OS remains authoritative during that interval.
 const order=(await c.query(`SELECT to_jsonb(o) AS document FROM m8_ordens_servico o
  WHERE o.company_id=$1 AND o.id_m8=$2 FOR SHARE`,[companyId,orderId])).rows[0]?.document;
 const explicit=order?.produto_equipamento_id ?? order?.payload?.produtoEquipamentoId;
 return explicit!=null && String(explicit)===String(equipmentId);
}
