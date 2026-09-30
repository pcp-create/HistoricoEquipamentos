import { fold, type Variant } from "./rules";
export type BrandedVariant = Variant & { brand: string };
const canonical: Record<string, string> = {
  "ATLAS COPCO": "Atlas Copco",
  WAYNE: "Wayne",
  METALPLAN: "Metalplan",
  PRESSURE: "Pressure",
};
const name = (value: string) => canonical[fold(value).trim()] || value.trim();
/** Use declared manufacturer/provenance, never infer a brand from a model prefix alone. */
export function variantBrand(
  v: Pick<Variant, "name" | "header"> & {
    source_manufacturer?: string;
    source_filename?: string;
  },
) {
  if (v.source_manufacturer?.trim()) return name(v.source_manufacturer);
  for (const value of [v.header[0] || "", v.name]) {
    const label = fold(value).replace(/^PADRAO (?:CONSTRUTIVO )?/, "");
    for (const [key, brand] of Object.entries(canonical))
      if (
        label === key ||
        label.startsWith(key + " ·") ||
        label.startsWith(key + " (")
      )
        return brand;
  }
  if (
    v.source_filename === "Cadastros adicionais do sistema" &&
    v.header[0]?.trim()
  )
    return name(v.header[0]);
  if (/^COMPARATIVO 2017 GA-GX REV\.11\.XLS$/i.test(v.source_filename || ""))
    return "Atlas Copco";
  return "Não informada";
}
export function catalogBrands(variants: BrandedVariant[]) {
  const groups = new Map<string, Set<string>>();
  for (const v of variants) {
    const models = groups.get(v.brand) || new Set<string>();
    for (const model of v.models) models.add(model);
    groups.set(v.brand, models);
  }
  return [...groups]
    .map(([name, models]) => ({
      name,
      models: [...models].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true }),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
