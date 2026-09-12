import { isNotApproved } from "./material-approval";
import { sameUnit, type ProductCurrent } from "./product-values";
export function estimatedMaterialCost(
  materials: Record<string, unknown>[],
  complete: boolean,
) {
  let cents = 0,
    missing = 0;
  for (const item of materials) {
    if (item.esta_excluido === true || isNotApproved(item.aprovado)) continue;
    const current = item.current as ProductCurrent | undefined;
    const quantity = Number(item.quantidade);
    const unitCost =
      item.current_average_cost == null
        ? NaN
        : Number(item.current_average_cost);
    if (
      !Number.isFinite(quantity) ||
      item.quantidade == null ||
      quantity <= 0 ||
      !sameUnit(String(item.unidade_nome || ""), current?.unit) ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      missing++;
      continue;
    }
    const cost = Math.round(quantity * unitCost * 100);
    if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(cents + cost)) {
      missing++;
      continue;
    }
    cents += cost;
  }
  return { amount: complete && missing === 0 ? cents / 100 : null, missing };
}
export function estimatedProfit(
  revenue: unknown,
  materials: string,
  services: string,
) {
  const amount = (v: unknown) =>
    v == null ||
    String(v).trim() === "" ||
    !Number.isFinite(Number(v)) ||
    Number(v) < 0
      ? null
      : Math.round(Number(v) * 100);
  const sales = amount(revenue),
    m = amount(materials),
    s = amount(services);
  if (
    sales === null ||
    m === null ||
    s === null ||
    ![sales, m, s].every(Number.isSafeInteger)
  )
    return null;
  return {
    cost: (m + s) / 100,
    profit: (sales - m - s) / 100,
    margin: sales > 0 ? ((sales - m - s) / sales) * 100 : null,
  };
}

export function orderLaborHours(
  services: Record<string, unknown>[],
  complete: boolean,
): number | null {
  if (!complete) return null;
  let hours = 0;
  for (const s of services) {
    if (s.esta_excluido === true) continue;
    const unit = String(s.service_unit || "")
      .trim()
      .toUpperCase();
    if (
      !["H", "HR", "HRS", "HORA", "HORAS"].includes(unit) ||
      s.quantidade == null ||
      !Number.isFinite(Number(s.quantidade)) ||
      Number(s.quantidade) < 0
    )
      return null;
    hours += Number(s.quantidade);
  }
  return hours;
}
