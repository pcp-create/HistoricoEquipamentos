import "server-only";
import { database } from "./db";
import type { ProductCurrent } from "./product-values";
export async function currentProducts(
  rows: { company_id: number; product_id?: string | null }[],
) {
  const keys = rows
    .filter((r) => r.product_id)
    .map((r) => ({ company_id: r.company_id, product_id: r.product_id }));
  if (!keys.length) return new Map<string, ProductCurrent>();
  const result = await database().query(
    `SELECT c.* FROM public.m8_product_current c JOIN
   (SELECT DISTINCT company_id,product_id FROM jsonb_to_recordset($1::jsonb) AS k(company_id bigint,product_id bigint)) k USING(company_id,product_id)`,
    [JSON.stringify(keys)],
  );
  return new Map<string, ProductCurrent>(
    result.rows.map((r) => [`${r.company_id}:${r.product_id}`, r]),
  );
}
