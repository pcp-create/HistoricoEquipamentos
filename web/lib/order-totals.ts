type Item = Record<string, unknown>;
function cents(value: unknown): number | null {
  if (
    value == null ||
    value === "" ||
    !["number", "string"].includes(typeof value)
  )
    return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const result = Math.round(number * 100);
  return Number.isSafeInteger(result) ? result : null;
}
export function orderTotals(
  materials: Item[],
  services: Item[],
  total: unknown,
  complete: boolean,
) {
  const sum = (items: Item[]) => {
    let result = 0;
    for (const item of items) {
      if (item.esta_excluido === true) continue;
      const value = cents(item.valor_total);
      if (value === null) return null;
      result += value;
      if (!Number.isSafeInteger(result)) return null;
    }
    return complete ? result : null;
  };
  const materialsCents = sum(materials),
    servicesCents = sum(services),
    orderCents = cents(total);
  const combined =
    materialsCents === null || servicesCents === null
      ? null
      : materialsCents + servicesCents;
  const amount = (value: number | null) =>
    value === null ? null : value / 100;
  return {
    materials: amount(materialsCents),
    services: amount(servicesCents),
    combined: amount(combined),
    difference:
      orderCents === null || combined === null
        ? null
        : amount(orderCents - combined),
  };
}
