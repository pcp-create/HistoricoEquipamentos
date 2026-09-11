import { transaction, type Database } from "../database/postgres.js";
import { relate, type EquipmentIdentity, type OrderIdentity } from "./rules.js";
export async function rebuildEquipmentLinks(db: Database, company: number) {
  const exists = (
    await db.query("SELECT to_regclass('public.m8_equipment_catalog') AS name")
  ).rows[0];
  if (!exists?.name) return { links: 0, review: 0 };
  return transaction(db, async () => {
    await db.query("SELECT pg_advisory_xact_lock(81014,0)");
    await db.query("SELECT pg_advisory_xact_lock(81014,$1)", [company]);
    const equipment = (
      await db.query<EquipmentIdentity & Record<string, unknown>>(
        `SELECT e.equipment_id::text,e.name,e.model,e.serial,e.serial_source,
   COALESCE(array_agg(DISTINCT p.person_id::text) FILTER(WHERE p.person_id IS NOT NULL),'{}') AS people
   FROM m8_equipment_catalog e LEFT JOIN m8_person_equipment p ON p.company_id=$1 AND p.equipment_id=e.equipment_id AND p.present
   WHERE e.present GROUP BY e.equipment_id`,
        [company],
      )
    ).rows;
    const orders = (
      await db.query<OrderIdentity & Record<string, unknown>>(
        `SELECT o.id_m8::text AS order_id,o.cliente_id::text AS client_id,o.modelo_equipamento AS model,
   array_remove(ARRAY[o.produto_equipamento_id::text] || COALESCE(e.ids,'{}'),NULL) AS explicit_ids,
   array_remove(ARRAY[o.numero_serie,o.serie] || COALESCE(e.serials,'{}'),NULL) AS serials,
   jsonb_build_array(jsonb_build_object('field','observacao','text',COALESCE(o.observacao,'')),jsonb_build_object('field','equipamento','text',COALESCE(o.equipamento,''))) || COALESCE(e.texts,'[]'::jsonb) || COALESCE(m.texts,'[]'::jsonb) AS texts
   FROM m8_ordens_servico o LEFT JOIN LATERAL(
    SELECT array_agg(equipamento_produto_id::text) AS ids,array_agg(numero_serie) AS serials,
     jsonb_agg(jsonb_build_object('field','equipamento.observacoes','text',concat_ws(' ',observacoes,observacoes_internas,defeitos,problema,solucao,pendencia))) AS texts
    FROM m8_equipamentos WHERE company_id=o.company_id AND ordem_servico_id=o.id_m8
   ) e ON true LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('field','manutencao.observacoes','text',concat_ws(' ',observacao,observacoes_revisao,laudo,defeitos,condicao_entrada))) AS texts FROM m8_os_manutencoes WHERE company_id=o.company_id AND ordem_servico_id=o.id_m8) m ON true WHERE o.company_id=$1`,
        [company],
      )
    ).rows;
    const links = orders.flatMap((o) => relate(o, equipment));
    await db.query("DELETE FROM m8_order_equipment_links WHERE company_id=$1", [
      company,
    ]);
    for (let n = 0; n < links.length; n += 500)
      await db.query(
        `INSERT INTO m8_order_equipment_links(company_id,order_id,equipment_id,method,evidence)
   SELECT $1,l.order_id,l.equipment_id,l.method,l.evidence FROM jsonb_to_recordset($2::jsonb) AS l(order_id bigint,equipment_id bigint,method text,evidence jsonb)`,
        [company, JSON.stringify(links.slice(n, n + 500))],
      );
    await db.query(
      "INSERT INTO m8_equipment_sync(company_id,linked_at) VALUES($1,now()) ON CONFLICT(company_id) DO UPDATE SET linked_at=now()",
      [company],
    );
    return {
      links: links.filter((l) => l.method !== "review").length,
      review: links.filter((l) => l.method === "review").length,
    };
  });
}
