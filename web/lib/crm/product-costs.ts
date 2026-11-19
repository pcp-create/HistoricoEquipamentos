import "server-only";
import { database } from "../db";
import { productAverageCostSql } from "../product-average-cost";
import { CrmError } from "./model";
import { applyAverageCosts, type AverageCost } from "./product-cost-model";
import type { OrderDraft } from "../service-orders/model";
export async function productAverageCosts(
  company: string,
  codes: string[],
  db: { query: Function } = database(),
): Promise<AverageCost[]> {
  if (
    !["1", "2", "27404"].includes(company) ||
    !Array.isArray(codes) ||
    codes.length > 200 ||
    codes.some((code) => !/^\d{1,10}$/.test(code))
  )
    throw new CrmError(
      "Empresa ou produtos inválidos para consulta de custo médio.",
    );
  if (!codes.length) return [];
  const result = await db.query(
    `SELECT p.product_id::text code,p.unit,s.average_cost,s.cost_at,v.available,v.available_at,p.payload->>'dataCustoFornecedor' supplier_cost_at,purchase.last_purchase_cost,purchase.last_purchase_at
 FROM m8_product_catalog p LEFT JOIN m8_product_current v USING(company_id,product_id) LEFT JOIN LATERAL (
 SELECT payload->>'valorCustoUltimaCompra' last_purchase_cost,payload->>'ultimaCompra' last_purchase_at
 FROM m8_product_stock WHERE company_id=p.company_id AND product_id=p.product_id
 AND NULLIF(payload->>'ultimaCompra','') IS NOT NULL
 ORDER BY payload->>'ultimaCompra' DESC,establishment_id LIMIT 1
 ) purchase ON true LEFT JOIN (
 SELECT product_id,${productAverageCostSql} average_cost,min(collected_at) cost_at
 FROM m8_product_stock WHERE company_id=$1 AND product_id=ANY($2::bigint[]) GROUP BY product_id
 ) s ON s.product_id=p.product_id WHERE p.company_id=$1 AND p.product_id=ANY($2::bigint[])`,
    [company, [...new Set(codes)]],
  );
  return result.rows.map((row: any) => {
    const cost = row.average_cost == null ? NaN : Number(row.average_cost);
    return {
      code: row.code,
      lastPurchaseCost: row.last_purchase_cost != null && row.last_purchase_cost !== '' && Number.isFinite(Number(row.last_purchase_cost)) && Number(row.last_purchase_cost) >= 0 ? String(Number(row.last_purchase_cost)) : '',
      lastPurchaseAt: row.last_purchase_at || undefined,
      supplierCostAt: row.supplier_cost_at || undefined,
      availableStock: row.available == null || !Number.isFinite(Number(row.available)) ? null : Number(row.available),
      stockAt: row.available_at ? new Date(row.available_at).toISOString() : undefined,
      unit: row.unit,
      unitCost:
        Number.isFinite(cost) && cost >= 0 && cost < 100000000
          ? cost.toFixed(6).replace(/\.?0+$/, "") || "0"
          : "",
      costAt: row.cost_at ? new Date(row.cost_at).toISOString() : null,
    };
  });
}
export async function hydrateProductCosts(
  draft: OrderDraft,
  db: { query: Function } = database(),
): Promise<OrderDraft> {
  const codes = draft.items
    .filter((i) => i.kind === "material")
    .map((i) => i.code);
  if (!codes.length) return draft;
  return {
    ...draft,
    items: applyAverageCosts(
      draft.items,
      await productAverageCosts(draft.company, codes, db),
    ),
  };
}
