import 'server-only';
import {blankOperation} from './model';

/** Use the ERP equipment ID, or the sole current link when ERP has no explicit ID. */
export async function defaultOperation(c:any,companyId:string|number,orderId:string|number){
 const document:any=blankOperation();
 const order=(await c.query('SELECT to_jsonb(o) AS document FROM m8_ordens_servico o WHERE company_id=$1 AND id_m8=$2',[companyId,orderId])).rows[0]?.document;
 const explicit=order?.produto_equipamento_id??order?.payload?.produtoEquipamentoId;
 let equipment;
 if(explicit){
  equipment=(await c.query('SELECT equipment_id::text,name,serial FROM m8_equipment_catalog WHERE equipment_id=$1 AND present',[String(explicit)])).rows[0];
 }else{
  const rows=(await c.query(`SELECT DISTINCT e.equipment_id::text,e.name,e.serial
   FROM m8_order_equipment_links l JOIN m8_equipment_catalog e USING(equipment_id)
   WHERE l.company_id=$1 AND l.order_id=$2 AND NOT l.stale AND e.present LIMIT 2`,[companyId,orderId])).rows;
  if(rows.length===1)equipment=rows[0];
 }
 if(equipment){document.equipmentId=equipment.equipment_id;document.equipment={...equipment,...(order?.equipamento?{label:order.equipamento}:{})};}
 return document;
}
