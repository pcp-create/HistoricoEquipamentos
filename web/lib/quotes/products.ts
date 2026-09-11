import "server-only";
import { database } from "../db";
import { currentProducts } from "../product-current";
import type { QuoteItem } from "./types";

/** Live balances are hydrated on reads, never stored as draft quantities. */
export async function quoteProducts(items: QuoteItem[]): Promise<QuoteItem[]> {
  const ids = [
    ...new Set(
      items
        .filter(
          (i) =>
            i.kind === "material" &&
            i.key.startsWith("p:") &&
            /^\d{1,18}$/.test(i.code),
        )
        .map((i) => i.code),
    ),
  ];
  if (!ids.length) return items;
  const rows = (
    await database().query(
      `SELECT company_id,product_id::text,name,unit,
      payload->>'referenciaFabricante' AS reference,
      payload->>'codigoSimilaridade' AS similarity,
      payload->>'bloqueado' AS blocked
      FROM m8_product_catalog WHERE company_id IN (1,2,27404) AND product_id=ANY($1::bigint[])`,
      [ids],
    )
  ).rows;
  const balances = await currentProducts(rows);
  return items.map((item) => ({
    ...item,
    products:
      item.kind === "material" && item.key.startsWith("p:")
        ? rows
            .filter((r) => r.product_id === item.code)
            .map((r) => ({
              ...r,
              fields: [],
              match_total: 1,
              current: balances.get(`${r.company_id}:${r.product_id}`),
            }))
        : [],
  }));
}
