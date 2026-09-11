import type { CatalogProduct } from "../manufacturer/products";
import type { QuoteItem, QuoteSalesHistory } from "./types";

export function quoteOrigin(item: QuoteItem, products: CatalogProduct[] = []) {
  if (products.some((p) => p.fields.includes("referenciaFabricante")))
    return "genuine";
  if (products.some((p) => p.fields.includes("codigoSimilaridade")))
    return "similar";
  if (item.source.includes("Referência fabricante (Genuína)")) return "genuine";
  if (item.source.includes("Código de similaridade")) return "similar";
  return "unknown";
}
export function compareQuoteItems(
  a: QuoteItem,
  b: QuoteItem,
  histories: Record<string, QuoteSalesHistory> = {},
  products: CatalogProduct[] = [],
) {
  const rank = { genuine: 0, similar: 1, unknown: 2 };
  const origin = (i: QuoteItem) =>
    rank[
      quoteOrigin(
        i,
        products.filter((p) => p.product_id === i.code),
      )
    ];
  const time = (i: QuoteItem) => {
    const date = i.source.startsWith("Base geral")
      ? i.generalSale?.date
      : histories[i.key]?.rows[0]?.date;
    return date && Number.isFinite(Date.parse(date))
      ? Date.parse(date)
      : -Infinity;
  };
  return (
    origin(a) - origin(b) ||
    (time(a) === time(b) ? 0 : time(a) > time(b) ? -1 : 1) ||
    a.name.localeCompare(b.name, "pt-BR") ||
    a.key.localeCompare(b.key)
  );
}
