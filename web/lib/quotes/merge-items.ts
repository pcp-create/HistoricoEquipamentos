import {
  quoteItemIdentity,
  type QuoteItem,
  type QuoteSalesHistory,
} from "./types";
import { sameUnit } from "../product-values";
/** Match ERP identity instead of list-specific keys; never replace a user's quantity/unit/price. */
export function mergeQuoteItems(
  saved: QuoteItem[],
  suggested: QuoteItem[],
  history: Record<string, QuoteSalesHistory> = {},
) {
  const groups = new Map<string, QuoteItem[]>();
  for (const i of [...suggested, ...saved]) {
    const id = quoteItemIdentity(i);
    const group = groups.get(id) || [];
    group.push(i);
    groups.set(id, group);
  }
  const all = new Map<string, QuoteItem>(),
    aliases = new Map<string, string>();
  const histories: Record<string, QuoteSalesHistory> = {},
    references = new Map<string, QuoteItem>();
  for (const [identity, group] of groups) {
    const drafts = saved.filter((i) => quoteItemIdentity(i) === identity);
    const winner = drafts.find((i) => i.selected) || drafts[0] || group[0];
    const reference = group
      .filter((i) => winner.kind === "service" || sameUnit(i.unit, winner.unit))
      .sort(
        (a, b) =>
          (Date.parse(history[b.key]?.rows[0]?.date || "") || 0) -
          (Date.parse(history[a.key]?.rows[0]?.date || "") || 0),
      )
      .find((i) => history[i.key]?.rows.length);
    const item = { ...winner };
    if (reference) {
      histories[winner.key] = history[reference.key];
      references.set(winner.key, reference);
      item.lastPrice = history[reference.key].rows[0]?.unitPrice || "";
    }
    all.set(winner.key, item);
    for (const i of group) aliases.set(i.key, winner.key);
  }
  return { all, aliases, histories, references };
}
