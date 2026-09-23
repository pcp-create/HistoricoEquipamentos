import "server-only";
import type { PoolClient } from "pg";
import type { PlanItem } from "./plan-items";
import { EquipmentInputError } from "./planning";
/** Refresh descriptions/prices from the ERP, preferring the selected company. */
export async function planCatalog(
  c: Pick<PoolClient, "query">,
  items: PlanItem[],
  company = "1",
) {
  const result = new Map<
    string,
    { name: string; unit: string; price: string; minimum: string }
  >();
  for (const kind of ["material", "service"] as const) {
    const ids = items.filter((i) => i.kind === kind).map((i) => i.code);
    if (!ids.length) continue;
    const table =
      kind === "material" ? "m8_product_catalog" : "m8_service_catalog";
    const id = kind === "material" ? "product_id" : "service_id";
    const rows = (
      await c.query(
        `SELECT DISTINCT ON(${id}) ${id}::text AS id,name,unit,sale_price::text,minimum_price::text
      FROM ${table} WHERE ${id}=ANY($1::bigint[]) AND company_id IN(1,2,27404)
      ORDER BY ${id},(company_id=$2) DESC,company_id`,
        [ids, Number(company)],
      )
    ).rows;
    for (const r of rows)
      result.set(`${kind}:${r.id}`, {
        name: r.name,
        unit: r.unit || "",
        price: r.sale_price ?? "",
        minimum: r.minimum_price ?? "",
      });
    for (const id of ids)
      if (!result.has(`${kind}:${id}`))
        throw new EquipmentInputError(
          `Cadastro não encontrado: ${kind === "material" ? "material" : "serviço"} ${id}. Reabra o plano e confira os itens.`,
        );
  }
  return result;
}
