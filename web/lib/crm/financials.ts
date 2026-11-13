import type { OrderDraft, OrderItem } from "../service-orders/model";
export function discountedUnitCents(item: OrderItem) {
  const base = Math.round(Number(item.price) * 100),
    percent = Number(item.discountPercent || 0);
  const rate = Math.round(
    Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0)) * 100,
  );
  return Math.round((base * (10000 - rate)) / 10000);
}
/** Only the ERP request uses net prices; the CRM snapshot preserves base prices and percentages. */
export function proposalOrderDraft(draft: OrderDraft): OrderDraft {
  return {
    ...draft,
    items: draft.items.map((item) => {
      const { discountPercent, ...rest } = item;
      return Number(discountPercent)>0?{ ...rest, price: (discountedUnitCents(item) / 100).toFixed(2) }:rest;
    }),
  };
}
export function itemFinancials(item: OrderItem) {
  const quantity = Number(item.quantity),
    sale = Math.round(quantity * discountedUnitCents(item));
  const hasCost =
    typeof item.unitCost === "string" &&
    /^\d{1,8}(\.\d{1,6})?$/.test(item.unitCost);
  const cost = hasCost
    ? Math.round(quantity * Number(item.unitCost) * 100)
    : null;
  const profit = cost === null ? null : sale - cost;
  return {
    sale,
    cost,
    profit,
    margin: profit === null || sale === 0 ? null : (profit / sale) * 100,
  };
}
export function proposalFinancials(items: OrderItem[]) {
  const lines = items.map(itemFinancials),
    sale = lines.reduce((n, l) => n + l.sale, 0),
    missing = lines.filter((l) => l.cost === null).length;
  const knownCost = lines.reduce((n, l) => n + (l.cost ?? 0), 0),
    cost = missing ? null : knownCost,
    profit = cost === null ? null : sale - cost;
  return {
    sale,
    cost,
    knownCost,
    profit,
    margin: profit === null || sale === 0 ? null : (profit / sale) * 100,
    missing,
    materials: items
      .filter((i) => i.kind === "material")
      .reduce((n, i) => n + itemFinancials(i).sale, 0),
    services: items
      .filter((i) => i.kind === "service")
      .reduce((n, i) => n + itemFinancials(i).sale, 0),
  };
}
