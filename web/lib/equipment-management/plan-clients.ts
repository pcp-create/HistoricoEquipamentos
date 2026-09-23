import "server-only";
import type { PoolClient } from "pg";
import { approvedMaterialSql } from "../material-approval";
export async function planClients(
  c: Pick<PoolClient, "query">,
  equipment: string,
) {
  return (
    await c.query(
      `WITH current_rental AS (
    SELECT o.cliente_id::text AS id,o.cliente_nome AS name,0 AS priority
    FROM m8_os_produtos p JOIN m8_ordens_servico o ON o.company_id=p.company_id AND o.id_m8=p.ordem_servico_id
    WHERE p.produto_id=$1 AND o.company_id IN(1,2,27404) AND o.status='Pendente' AND o.tipo_id IN(8,45)
      AND o.cliente_id IS NOT NULL AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")}
    ORDER BY COALESCE(o.emissao,o.data_abertura) DESC NULLS LAST,o.id_m8 DESC LIMIT 1
  ), choices AS (
    SELECT * FROM current_rental UNION ALL
    SELECT person_id::text,person_name,1 FROM m8_person_equipment WHERE equipment_id=$1 AND present
  ), unique_clients AS (SELECT DISTINCT ON(id) * FROM choices ORDER BY id,priority,name)
  SELECT * FROM unique_clients ORDER BY priority,name`,
      [equipment],
    )
  ).rows;
}
