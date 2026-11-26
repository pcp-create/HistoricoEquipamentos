import { discountedUnitCents } from "./financials";
import type { OrderDraft, OrderItem } from "../service-orders/model";
/** Shared by the editor and server: unrelated edits do not revoke another item's approval. */
export function itemPriceKey(
  draft: Pick<OrderDraft, "company" | "customer">,
  item: OrderItem,
  leadId = "",
) {
  return JSON.stringify([
    draft.company,
    draft.customer,
    leadId,
    item.kind,
    item.code,
    Number(item.quantity),
    discountedUnitCents(item),
  ]);
}
