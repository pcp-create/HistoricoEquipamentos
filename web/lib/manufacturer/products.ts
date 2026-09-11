import type { ProductCurrent } from "../product-values";
export type CatalogProduct = {
  company_id: number | string;
  product_id: string;
  name: string;
  unit?: string | null;
  reference: string | null;
  similarity: string | null;
  fields: string[];
  match_total: number;
  current?: ProductCurrent;
};
function total(
  rows: CatalogProduct[],
  field: "stock" | "available",
  compatible: boolean,
) {
  const values = rows.map((r) => {
    const v = r.current?.[field];
    return v == null || String(v).trim() === "" ? null : Number(v);
  });
  const known = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  return {
    value: compatible && known.length ? known.reduce((a, b) => a + b, 0) : null,
    complete: compatible && known.length === rows.length,
  };
}
export function groupedProducts(products: CatalogProduct[]) {
  const groups = new Map<string, Map<string, CatalogProduct>>();
  for (const product of products) {
    let companies = groups.get(product.product_id);
    if (!companies) {
      companies = new Map();
      groups.set(product.product_id, companies);
    }
    companies.set(String(product.company_id), product);
  }
  return [...groups]
    .map(([id, byCompany]) => {
      const companies = [...byCompany.values()].sort(
        (a, b) => Number(a.company_id) - Number(b.company_id),
      );
      const fields = ["referenciaFabricante", "codigoSimilaridade"].filter(
        (f) => companies.some((p) => p.fields.includes(f)),
      );
      const units = companies.map((p) =>
        (p.current?.unit || p.unit || "").trim().toUpperCase(),
      );
      const compatible = units.every((u) => !!u && u === units[0]);
      return {
        id,
        name: companies[0].name,
        companies,
        fields,
        genuine: fields.includes("referenciaFabricante"),
        unit: compatible ? units[0] : "",
        compatible,
        stock: total(companies, "stock", compatible),
        available: total(companies, "available", compatible),
      };
    })
    .sort(
      (a, b) =>
        Number(b.genuine) - Number(a.genuine) || Number(a.id) - Number(b.id),
    );
}
