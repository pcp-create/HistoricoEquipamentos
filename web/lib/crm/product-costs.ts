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
    `SELECT p.product_id::text code,p.unit,s.average_cost,s.cost_at
 FROM m8_product_catalog p LEFT JOIN (
 SELECT product_id,${productAverageCostSql} average_cost,min(collected_at) cost_at
 FROM m8_product_stock WHERE company_id=$1 AND product_id=ANY($2::bigint[]) GROUP BY product_id
 ) s ON s.product_id=p.product_id WHERE p.company_id=$1 AND p.product_id=ANY($2::bigint[])`,
    [company, [...new Set(codes)]],
  );
  return result.rows.map((row: any) => {
    const cost = row.average_cost == null ? NaN : Number(row.average_cost);
    return {
      code: row.code,
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
