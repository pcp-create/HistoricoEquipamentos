import { approvedMaterialSql } from "./material-approval";
import "server-only";
import { database } from "./db";
export async function productLookup(code: string) {
  if (!/^[1-9]\d{0,17}$/.test(code))
    throw new Error("Informe o código numérico do material.");
  return (
    await database().query(
      `SELECT c.company_id,c.product_id::text,c.name,c.unit,
    c.payload->>'referenciaFabricante' AS reference,
    v.sale_price,v.minimum_price,v.price_at,v.stock,v.available,v.stock_value,v.stock_at,v.available_at,
    cost.average_cost,cost.cost_at,sale.last_sale_at,sale.last_order_id,sale.last_order_number
    FROM m8_product_catalog c LEFT JOIN m8_product_current v USING(company_id,product_id)
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(average_cost)=count(*) AND min(average_cost)>=0 THEN
        CASE WHEN min(average_cost)=max(average_cost) THEN min(average_cost)
        WHEN count(stock)=count(*) AND min(stock)>=0 AND sum(stock)>0 THEN sum(average_cost*stock)/sum(stock) END END AS average_cost,
        min(collected_at) AS cost_at
      FROM m8_product_stock s WHERE s.company_id=c.company_id AND s.product_id=c.product_id
    ) cost ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(o.emissao,o.data_abertura) AS last_sale_at,
        o.id_m8::text AS last_order_id,COALESCE(o.numero_sequencia,o.id_m8)::text AS last_order_number
      FROM m8_ordens_servico o
      JOIN integracao_m8_os_sync sync ON sync.company_id=o.company_id AND sync.ordem_servico_id=o.id_m8
      WHERE o.company_id=c.company_id AND o.status='Processado' AND sync.finalized AND NOT sync.pending
        AND EXISTS(SELECT 1 FROM m8_os_produtos p WHERE p.company_id=o.company_id AND p.ordem_servico_id=o.id_m8
          AND p.produto_id=c.product_id AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")} AND p.quantidade>0)
      ORDER BY COALESCE(o.emissao,o.data_abertura) DESC NULLS LAST,o.id_m8 DESC LIMIT 1
    ) sale ON true
    WHERE c.product_id=$1 AND c.company_id IN (1,2,27404) ORDER BY c.company_id`,
      [code],
    )
  ).rows;
}
