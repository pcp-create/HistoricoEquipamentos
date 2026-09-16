import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupedProducts,
  type CatalogProduct,
} from "../lib/manufacturer/products";
function product(
  company: number,
  id = "10",
  stock: string | null = "2",
  unit: string | null = "UN",
  fields = ["codigoSimilaridade"],
): CatalogProduct {
  return {
    company_id: company,
    product_id: id,
    name: "Filtro",
    unit,
    reference: "1234567890",
    similarity: "1234567890",
    fields,
    match_total: 1,
    current: {
      unit,
      stock,
      available: stock,
      stock_value: null,
      stock_at: "2026-09-11T00:00:00Z",
      available_at: "2026-09-11T00:00:00Z",
      price_at: null,
      sale_price: null,
      minimum_price: null,
    },
  };
}
test("one card per product sums each company once and prioritizes positive stock over origin", () => {
  const rows = [
    product(1),
    product(2),
    product(27404),
    product(1),
    product(1, "99", "0", "UN", ["referenciaFabricante"]),
  ];
  const groups = groupedProducts(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, "10");
  assert.equal(groups[1].stock.value, 0);
  assert.equal(groups[0].companies.length, 3);
  assert.deepEqual(groups[0].stock, { value: 6, complete: true });
  assert.deepEqual(
    groupedProducts([
      product(1, "10", "2", "UN", [
        "codigoSimilaridade",
        "referenciaFabricante",
      ]),
    ])[0].fields,
    ["referenciaFabricante", "codigoSimilaridade"],
  );
});
test("unknown/non-finite balances remain incomplete and incompatible units are not summed", () => {
  assert.deepEqual(
    groupedProducts([product(1), product(2, "10", null)])[0].stock,
    { value: 2, complete: false },
  );
  assert.deepEqual(groupedProducts([product(1, "10", "NaN")])[0].stock, {
    value: null,
    complete: false,
  });
  assert.deepEqual(
    groupedProducts([product(1), product(2, "10", "4", "CX")])[0].stock,
    { value: null, complete: false },
  );
  assert.equal(
    groupedProducts([product(1, "10", "-2"), product(2, "10", "1")])[0].stock
      .value,
    -1,
  );
  assert.equal(
    groupedProducts([product(1, "10", "0.1"), product(2, "10", "0.2", "un")])[0]
      .stock.complete,
    true,
  );
});

test("collection dates and cost are consolidated conservatively; blocking is explicit and scoped by company", () => {
  const a = product(1),
    b = product(2),
    c = product(27404);
  a.current!.stock_value = "10";
  b.current!.stock_value = "20";
  c.current!.stock_value = "30";
  a.current!.stock_at = "2026-09-10T18:00:00Z";
  b.blocked = "Sim";
  c.blocked = "Nao";
  const group = groupedProducts([a, b, c])[0];
  assert.equal(group.stockAt, "2026-09-10T18:00:00.000Z");
  assert.deepEqual(group.stockValue, { value: 60, complete: true });
  assert.deepEqual(group.blockedCompanies, [2]);
  assert.deepEqual(
    groupedProducts([product(1, "20", "0")])[0].blockedCompanies,
    [],
  );
  c.current!.stock_at = null;
  c.current!.stock_value = null;
  const incomplete = groupedProducts([a, b, c])[0];
  assert.equal(incomplete.stockAt, null);
  assert.equal(incomplete.stockValue.complete, false);
  b.current!.available_at = "invalid";
  assert.equal(groupedProducts([a, b])[0].availableAt, null);
});

test("catalog sorting uses latest sale then positive stock then genuine", () => {
  const recent = {...product(1,"1","0"),last_sale_at:"2026-09-01"};
  const stocked = product(1,"2","2");
  const genuine = product(1,"3","2","UN",["referenciaFabricante"]);
  const noStock = product(1,"4","0","UN",["referenciaFabricante"]);
  assert.deepEqual(groupedProducts([noStock,stocked,genuine,recent]).map(p=>p.id),["1","3","2","4"]);
});
