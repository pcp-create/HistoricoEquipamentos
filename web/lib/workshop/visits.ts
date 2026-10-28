import "server-only";
/** Aggregate relationships once, instead of rescanning orders/tasks for every visit. */
export async function workshopVisits(db: any, admin: boolean): Promise<any[]> {
  return (
    await db.query(
      `WITH
 equipment_ids AS MATERIALIZED (SELECT DISTINCT equipment_id FROM web_workshop_visits WHERE equipment_id IS NOT NULL),
 linked_orders AS MATERIALIZED (
   SELECT o.produto_equipamento_id equipment_id,o.company_id,o.id_m8 order_id FROM m8_ordens_servico o JOIN equipment_ids e ON e.equipment_id=o.produto_equipamento_id
   UNION
   SELECT l.equipment_id,l.company_id,l.order_id FROM m8_order_equipment_links l JOIN equipment_ids e USING(equipment_id) WHERE NOT l.stale
 ),
 order_groups AS (
   SELECT l.equipment_id,jsonb_agg(jsonb_build_object('id',o.id_m8::text,'company',o.company_id,'number',COALESCE(o.numero_sequencia,o.id_m8)::text,'status',o.status,'status_lancamento_nome',o.status_lancamento_nome) ORDER BY o.company_id,o.id_m8) orders
   FROM linked_orders l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id WHERE o.status IN ('Pendente','Aprovado') GROUP BY l.equipment_id
 ),
 open_tasks AS MATERIALIZED (SELECT id,title,status,equipment_id,order_company,order_id,source_key FROM web_tasks WHERE status<>'completed' AND (NOT restricted OR $1::boolean)),
 task_equipment AS (
   SELECT t.id task_id,t.equipment_id FROM open_tasks t JOIN equipment_ids e USING(equipment_id)
   UNION
   SELECT t.id,l.equipment_id FROM open_tasks t JOIN linked_orders l ON l.company_id=t.order_company AND l.order_id=t.order_id
 ),
 task_visits AS (
   SELECT v.id visit_id,t.task_id FROM web_workshop_visits v JOIN task_equipment t USING(equipment_id)
   UNION
   SELECT v.id,t.id FROM open_tasks t JOIN web_workshop_visits v ON split_part(t.source_key,':',3)=v.id::text WHERE t.source_key LIKE 'manual:workshop:%'
 ),
 task_groups AS (
   SELECT l.visit_id,jsonb_agg(jsonb_build_object('id',t.id::text,'title',t.title,'status',t.status) ORDER BY t.id) tasks FROM task_visits l JOIN open_tasks t ON t.id=l.task_id GROUP BY l.visit_id
 ),
 clients AS (SELECT p.equipment_id,max(p.person_name) client FROM m8_person_equipment p JOIN equipment_ids e USING(equipment_id) WHERE p.present GROUP BY p.equipment_id),
 quote_groups AS (SELECT l.visit_id,jsonb_agg(jsonb_build_object('id',q.id::text,'company',q.company_id,'number',q.number,'status',q.status) ORDER BY q.company_id,q.id) quotes FROM web_workshop_quotes l JOIN m8_quotes q ON q.company_id=l.company_id AND q.id=l.quote_id GROUP BY l.visit_id),
 draft_groups AS (SELECT q.document->>'equipmentId' equipment_id,jsonb_agg(jsonb_build_object('id',q.id,'number',q.number,'client',q.client_name) ORDER BY q.id) drafts FROM web_quotes q WHERE q.document->>'deletedAt' IS NULL GROUP BY q.document->>'equipmentId')
 SELECT v.*,v.equipment_id::text,COALESCE(e.payload->>'familiaId'='3',false) rental,COALESCE(e.name,v.source->>'equipment_description') name,e.model,e.serial,COALESCE(w.name,'Oficina a confirmar') workshop,
 COALESCE(NULLIF(v.source->>'customer',''),c.client) client,COALESCE(o.orders,'[]'::jsonb) orders,COALESCE(t.tasks,'[]'::jsonb) tasks,COALESCE(q.quotes,'[]'::jsonb) quotes,COALESCE(d.drafts,'[]'::jsonb) drafts
 FROM web_workshop_visits v LEFT JOIN web_workshops w ON w.id=v.workshop_id LEFT JOIN m8_equipment_catalog e ON e.equipment_id=v.equipment_id
 LEFT JOIN clients c ON c.equipment_id=v.equipment_id LEFT JOIN order_groups o ON o.equipment_id=v.equipment_id LEFT JOIN task_groups t ON t.visit_id=v.id LEFT JOIN quote_groups q ON q.visit_id=v.id LEFT JOIN draft_groups d ON d.equipment_id=v.equipment_id::text
 ORDER BY v.entered_at DESC,v.id`,
      [admin],
    )
  ).rows;
}
