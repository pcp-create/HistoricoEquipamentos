import { approvedMaterialSql } from "./material-approval";
import "server-only";
import { database } from "./db";
export async function productLookup(code: string) {
  if (!/^[1-9]\d{0,17}$/.test(code))
    throw new Error("Informe o código numérico do material.");
  return (
    await database().query(
      `SELECT c.company_id,c.product_id::text,c.name,c.unit,
    c.payload->>'referenciaFabricante' AS reference,c.payload AS details,
    purchase.last_purchase_cost,purchase.last_purchase_at,
    purchase.establishment_name AS purchase_establishment,
    v.sale_price,v.minimum_price,v.price_at,v.stock,v.available,v.stock_value,v.stock_at,v.available_at,
    cost.average_cost,cost.cost_at,sale.last_sale_at,sale.last_order_id,sale.last_order_number
    FROM m8_product_catalog c LEFT JOIN m8_product_current v USING(company_id,product_id)
    LEFT JOIN LATERAL (
      SELECT s.payload->>'valorCustoUltimaCompra' AS last_purchase_cost,
        s.payload->>'ultimaCompra' AS last_purchase_at,s.establishment_name
      FROM m8_product_stock s WHERE s.company_id=c.company_id AND s.product_id=c.product_id
        AND NULLIF(s.payload->>'ultimaCompra','') IS NOT NULL
      ORDER BY s.payload->>'ultimaCompra' DESC,s.establishment_id LIMIT 1
    ) purchase ON true
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

export async function similarProducts(code: string) {
  return (await database().query(
    `WITH source_codes AS (
      SELECT DISTINCT code FROM manufacturer_product_codes
      WHERE product_id=$1 AND company_id IN (1,2,27404)
        AND field IN ('referenciaFabricante','codigoSimilaridade')
    ), related AS (
      SELECT DISTINCT product_id FROM manufacturer_product_codes
      WHERE code IN (SELECT code FROM source_codes)
        AND company_id IN (1,2,27404)
        AND field IN ('referenciaFabricante','codigoSimilaridade')
        AND product_id<>$1
    )
    SELECT c.product_id::text,c.company_id,c.name,c.unit,
      c.payload->>'referenciaFabricante' AS reference,
      c.payload->>'codigoSimilaridade' AS similarity,
      v.stock,v.available,v.stock_at,v.available_at
    FROM related r JOIN m8_product_catalog c USING(product_id)
    LEFT JOIN m8_product_current v USING(company_id,product_id)
    WHERE c.company_id IN (1,2,27404)
    ORDER BY c.name,c.product_id,c.company_id`,[code])).rows;
}

export async function searchProducts(query: string) {
  const terms = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  const result = await database().query(
    `WITH matches AS (
      SELECT DISTINCT ON (c.product_id) c.product_id::text AS product_id,c.name,c.unit,
        c.payload->>'referenciaFabricante' AS reference,
        c.payload->>'fabricanteNome' AS manufacturer,
        c.payload->>'codigoSimilaridade' AS similarity
      FROM m8_product_catalog c
      WHERE c.company_id IN (1,2,27404)
        AND NOT EXISTS (
          SELECT 1 FROM unnest($1::text[]) term WHERE strpos(
            translate(lower(concat_ws(' ',c.product_id,c.name,c.unit,
              (SELECT string_agg(value #>> '{}',' ') FROM jsonb_path_query(c.payload,'$.** ? (@.type() != "object" && @.type() != "array")') value))),
              'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),term)=0
        )
      ORDER BY c.product_id,c.company_id
    )
    SELECT *,count(*) OVER() AS total FROM matches
    ORDER BY (product_id=$2) DESC,name,product_id LIMIT 100`,
    [terms,query],
  );
  return { products: result.rows, total: Number(result.rows[0]?.total || 0) };
}
