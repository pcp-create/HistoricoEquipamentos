import test from "node:test";
import assert from "node:assert/strict";
import { priceComparison, type ProductCurrent } from "../lib/product-values";
const current = { unit: "UN", minimum_price: "10" } as ProductCurrent;
test("compares item total per unit to current minimum only for compatible, active materials", () => {
  assert.deepEqual(priceComparison("16", "2", "UN", current), {
    effective: 8,
    difference: -2,
    percent: -19.999999999999996,
  });
  assert.equal(priceComparison("16", "0", "UN", current).effective, null);
  assert.equal(priceComparison("16", "2", "LITROS", current).difference, null);
  assert.equal(
    priceComparison("16", "2", "UN", current, true).difference,
    null,
  );
  assert.equal(
    priceComparison("16", "2", "UN", { ...current, minimum_price: null })
      .difference,
    null,
  );
  assert.equal(priceComparison("0", "2", "UN", current).effective, 0);
  assert.equal(priceComparison(null, "2", "UN", current).effective, null);
});
