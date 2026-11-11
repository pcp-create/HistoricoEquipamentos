import 'server-only';
import {database} from '../db';
import {activeEquipmentWarranty,warrantyDay} from './warranty-period';
export async function equipmentWarranty(equipment:string,excludeCompany:string|null=null,excludeOrder:string|null=null){
 const rows=(await database().query(`WITH history AS (
 SELECT o.company_id::text company,o.id_m8::text "orderId",COALESCE(o.numero_sequencia,o.id_m8)::text number,
 COALESCE(o.emissao,o.data_abertura)::text "startedAt",o.data_garantia::text "expiresAt",
 COALESCE(local.request->'warrantySnapshot'->>'description',r.warranty_description) period,
 CASE WHEN local.request->'warrantySnapshot' IS NOT NULL THEN 'snapshot' ELSE 'registry' END "periodSource",
 o.tipo_atendimento_nome "serviceType"
 FROM m8_ordens_servico o
 LEFT JOIN service_order_registries r ON r.kind='service-types' AND r.id=o.tipo_atendimento_id
 LEFT JOIN LATERAL(SELECT request FROM service_order_submissions s WHERE s.company_id=o.company_id AND s.m8_id=o.id_m8 ORDER BY s.created_at DESC LIMIT 1) local ON true
 WHERE o.ativo IS NOT FALSE AND lower(COALESCE(o.status,'')) NOT IN('cancelado','cancelada') AND (
 o.produto_equipamento_id=$1 OR EXISTS(SELECT 1 FROM m8_order_equipment_links l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.equipment_id=$1 AND NOT l.stale AND l.method<>'review')
 OR EXISTS(SELECT 1 FROM m8_equipamentos e WHERE e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8 AND e.equipamento_produto_id=$1)
 OR EXISTS(SELECT 1 FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id WHERE s.company_id=o.company_id AND s.order_id=o.id_m8 AND p.document->>'equipmentId'=$1::text))
 UNION ALL
 SELECT s.company_id::text,s.m8_id::text,s.m8_id::text,COALESCE(s.header->>'emissao',s.created_at::text),NULL,
 s.request->'warrantySnapshot'->>'description','snapshot',NULL
 FROM service_order_submissions s WHERE s.m8_id IS NOT NULL AND s.request->>'equipment'=$1::text
 AND NOT EXISTS(SELECT 1 FROM m8_ordens_servico o WHERE o.company_id=s.company_id AND o.id_m8=s.m8_id)
 ) SELECT * FROM history WHERE NOT(company=COALESCE($2,'') AND "orderId"=COALESCE($3,''))
 ORDER BY "startedAt" DESC NULLS LAST LIMIT 200`,[equipment,excludeCompany,excludeOrder])).rows;
 return activeEquipmentWarranty(rows,warrantyDay(new Date())!);
}
