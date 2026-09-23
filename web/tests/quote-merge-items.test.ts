import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeQuoteItems } from "../lib/quotes/merge-items";
import type { QuoteItem, QuoteSalesHistory } from "../lib/quotes/types";
const item: QuoteItem = {
  kind: "material",
  key: "p:2:13996",
  code: "13996",
  name: "Filtro",
  unit: "UNIDADE",
  quantity: "2",
  price: "801",
  selected: true,
  source: "Plano",
  referencePrice: "801",
  minimumPrice: "",
  lastPrice: "",
  referenceAt: "",
};
const history = (
  date = "2026-06-15",
  unitPrice = "985",
): QuoteSalesHistory => ({
  count: 1,
  minimum: unitPrice,
  maximum: unitPrice,
  rows: [
    {
      company: "1",
      order: "13753",
      date,
      quantity: "1",
      unitPrice,
      total: unitPrice,
    },
  ],
});
test("legacy plan keys merge with history by ERP code and retain selections and user edits", () => {
  const suggestion = {
    ...item,
    key: "p:1:13996:UNIDADE",
    selected: false,
    quantity: "1",
    price: "",
  };
  const merged = mergeQuoteItems([item], [suggestion], {
    [suggestion.key]: history(),
  });
  assert.equal(merged.all.size, 1);
  assert.equal(merged.aliases.get(suggestion.key), item.key);
  assert.equal(merged.all.get(item.key)?.selected, true);
  assert.equal(merged.all.get(item.key)?.quantity, "2");
  assert.equal(merged.all.get(item.key)?.price, "801");
  assert.equal(merged.all.get(item.key)?.lastPrice, "985");
  assert.equal(merged.histories[item.key].rows[0].order, "13753");
});
test("custom service units keep history; incompatible material units do not reuse prices", () => {
  const service = {
    ...item,
    kind: "service" as const,
    key: "s:2:13996",
    unit: "Pacote",
  };
  const historic = { ...service, key: "s:1:13996", unit: "H", selected: false };
  assert.equal(
    mergeQuoteItems([service], [historic], { [historic.key]: history() })
      .histories[service.key].rows[0].unitPrice,
    "985",
  );
  const otherUnit = {
    ...item,
    key: "p:1:13996:CX",
    unit: "CX",
    selected: false,
  };
  const merged = mergeQuoteItems([item], [otherUnit], {
    [otherUnit.key]: history(),
  });
  assert.equal(merged.all.size, 1);
  assert.equal(merged.histories[item.key], undefined);
});
test("latest compatible history wins across companies and keys", () => {
  const a = { ...item, key: "p:1:13996:UNIDADE" },
    b = { ...item, key: "p:2:13996:UNIDADE" };
  const merged = mergeQuoteItems([item], [a, b], {
    [a.key]: history(),
    [b.key]: history("2026-07-15", "1000"),
  });
  assert.equal(merged.histories[item.key].rows[0].unitPrice, "1000");
});
