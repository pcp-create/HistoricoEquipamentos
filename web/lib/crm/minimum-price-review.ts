import { discountedUnitCents } from "./financials";
import type { OrderItem } from "../service-orders/model";

export type MinimumPriceItem = {
  code: string;
  name: string;
  saleCents: number;
  minimumCents: number;
};

/** Compare the same rounded unit price that will be submitted to M8. */
export function belowMinimumPrices(
  items: OrderItem[],
  minimums: Map<string, number | null>,
): MinimumPriceItem[] {
  return items
    .filter((item) => item.kind === "material")
    .flatMap((item) => {
      const minimum = minimums.get(item.code);
      if (
        minimum === undefined ||
        minimum === null ||
        !Number.isFinite(minimum) ||
        minimum < 0
      )
        throw new Error(
          `Preço mínimo indisponível para o produto ${item.code}.`,
        );
      const minimumCents = Math.ceil(minimum * 100 - 1e-7),
        saleCents = discountedUnitCents(item);
      return saleCents < minimumCents
        ? [{ code: item.code, name: item.name, saleCents, minimumCents }]
        : [];
    });
}
