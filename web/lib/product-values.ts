export type ProductCurrent = {
  unit: string | null;
  sale_price: string | null;
  minimum_price: string | null;
  price_at: string | null;
  stock: string | null;
  stock_value: string | null;
  stock_at: string | null;
  available: string | null;
  available_at: string | null;
};
export const sameUnit = (
  a: string | null | undefined,
  b: string | null | undefined,
) =>
  !!a?.trim() &&
  !!b?.trim() &&
  a.trim().toUpperCase() === b.trim().toUpperCase();
export function priceComparison(
  amount: string | null | undefined,
  quantity: string | null | undefined,
  unit: string | null | undefined,
  current: ProductCurrent | undefined,
  excluded = false,
) {
  const q = Number(quantity),
    total = amount == null ? NaN : Number(amount);
  const effective =
    q > 0 && Number.isFinite(q) && Number.isFinite(total) ? total / q : null;
  const minimum =
    current?.minimum_price == null ? null : Number(current.minimum_price);
  const comparable =
    !excluded &&
    effective !== null &&
    minimum !== null &&
    Number.isFinite(minimum) &&
    sameUnit(unit, current?.unit);
  return {
    effective,
    difference: comparable ? effective - minimum! : null,
    percent:
      comparable && minimum! > 0 ? (effective / minimum! - 1) * 100 : null,
  };
}
