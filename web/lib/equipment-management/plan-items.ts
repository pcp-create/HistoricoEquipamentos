import type { QuoteItem } from "../quotes/types";
export type PlanItem = Pick<
  QuoteItem,
  "kind" | "code" | "name" | "unit" | "quantity"
> & { unitEditable?: boolean };
export function parsePlanItems(value: unknown): PlanItem[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Use até 100 materiais e serviços por plano.");
  const seen = new Set<string>();
  return value.map((i): PlanItem => {
    if (
      !i ||
      !["material", "service"].includes(i.kind) ||
      typeof i.code !== "string" ||
      !/^[1-9]\d{0,17}$/.test(i.code) ||
      typeof i.name !== "string" ||
      !i.name.trim() ||
      i.name.length > 500 ||
      typeof i.unit !== "string" ||
      i.unit.length > 60 ||
      typeof i.quantity !== "string" ||
      !/^\d{1,7}(\.\d{1,3})?$/.test(i.quantity) ||
      Number(i.quantity) <= 0 ||
      Number(i.quantity) > 1000000
    )
      throw new Error(
        "Confira o cadastro e a quantidade dos materiais e serviços.",
      );
    const key = `${i.kind}:${i.code}`;
    if (seen.has(key))
      throw new Error("O material ou serviço já está neste plano.");
    seen.add(key);
    return {
      kind: i.kind,
      code: i.code,
      name: i.name.trim(),
      unit: i.unit.trim(),
      quantity: i.quantity,
    };
  });
}

/** Fixed material units belong to the catalog; services and blank catalog units may be customized. */
export function planItemUnit(item: PlanItem, catalogUnit: string) {
  const registered = catalogUnit.trim();
  const unitEditable = item.kind === "service" || !registered;
  return { unit: unitEditable ? item.unit.trim() : registered, unitEditable };
}
