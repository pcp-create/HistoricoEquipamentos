import type { OrderDraft, OrderItem } from "../service-orders/model";
import { discountedUnitCents } from "./financials";
export type ProductTaxes = {
  key: string;
  at: string;
  icms: number;
  icmsSt: number;
  pis: number;
  cofins: number;
  ipi: number;
};
export function taxKey(draft: OrderDraft, item: OrderItem) {
  return JSON.stringify([
    draft.company,
    draft.customer,
    draft.commercial?.taxBudgetType,
    item.code,
    item.quantity,
    discountedUnitCents(item),
  ]);
}
export function currentTaxes(draft: OrderDraft, item: OrderItem) {
  return item.taxes?.key === taxKey(draft, item) ? item.taxes : undefined;
}
export function deliveryTerm(draft: OrderDraft, item: OrderItem) {
  if (item.deliveryLeadTime?.trim()) return item.deliveryLeadTime.trim();
  // Repeated product lines share the same available inventory.
  const required = draft.items
    .filter((i) => i.kind === "material" && i.code === item.code)
    .reduce((sum, i) => sum + Number(i.quantity), 0);
  if (
    item.availableStock != null &&
    Number.isFinite(item.availableStock) &&
    required > 0 &&
    item.availableStock >= required
  )
    return "Imediato";
  return draft.commercial?.deliveryDays?.trim()
    ? `${draft.commercial.deliveryDays} dias úteis`
    : "Prazo não informado";
}
