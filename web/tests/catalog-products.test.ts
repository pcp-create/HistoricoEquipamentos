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
test("one card per product sums each company once and places genuine references first", () => {
  const rows = [
    product(1),
    product(2),
    product(27404),
    product(1),
    product(1, "99", "0", "UN", ["referenciaFabricante"]),
  ];
  const groups = groupedProducts(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, "99");
  assert.equal(groups[0].stock.value, 0);
  assert.equal(groups[1].companies.length, 3);
  assert.deepEqual(groups[1].stock, { value: 6, complete: true });
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
