import type { OrderItem } from "../service-orders/model";
import { sameUnit } from "../product-values";
export type AverageCost = {
  code: string;
  unit: string | null;
  unitCost: string;
  costAt: string | null;
};
export function applyAverageCosts(
  items: OrderItem[],
  costs: AverageCost[],
): OrderItem[] {
  const byCode = new Map(costs.map((row) => [row.code, row]));
  return items.map((item) => {
    if (item.kind !== "material") return item;
    const row = byCode.get(item.code),
      mismatch =
        !!row &&
        !!item.quote?.unit?.trim() &&
        !sameUnit(item.quote.unit, row.unit);
    return {
      ...item,
      unitCost: !mismatch && row?.unitCost ? row.unitCost : "",
      unitCostSource: "average",
      unitCostAt: row?.costAt || undefined,
      unitCostReason: mismatch
        ? "unit_mismatch"
        : row?.unitCost
          ? ""
          : "missing",
    };
  });
}
