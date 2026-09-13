import type { CatalogProduct } from "../manufacturer/products";
export type QuoteItem = {
  products?: CatalogProduct[];
  key: string;
  kind: "material" | "service";
  code: string;
  name: string;
  unit: string;
  quantity: string;
  price: string;
  selected: boolean;
  source: string;
  referencePrice: string;
  minimumPrice: string;
  lastPrice: string;
  referenceAt: string;
  generalSale?: QuoteSale;
};
export type Quote = {
  id?: string;
  version?: number;
  company: string;
  clientId: string;
  client: string;
  equipment: string;
  equipmentId?: string;
  model: string;
  serial: string;
  serviceType: string;
  interval: string;
  variant: string;
  notes: string;
  responsible?: string;
  items: QuoteItem[];
};
export const blankQuote = (): Quote => ({
  company: "1",
  clientId: "",
  client: "",
  equipment: "",
  model: "",
  serial: "",
  serviceType: "",
  interval: "",
  variant: "",
  notes: "",
  responsible: "",
  items: [],
});
export function lineAmount(item: QuoteItem): number | null {
  if (
    !/^\d{1,7}(\.\d{1,3})?$/.test(item.quantity) ||
    !/^\d{1,8}(\.\d{1,2})?$/.test(item.price)
  )
    return null;
  const qty = Math.round(Number(item.quantity) * 1000),
    price = Math.round(Number(item.price) * 100);
  if (qty <= 0 || qty > 1000000000 || price > 1000000000) return null;
  const product = qty * price;
  if (!Number.isSafeInteger(product)) return null;
  return Math.round(product / 1000);
}
export function quoteTotals(items: QuoteItem[]) {
  let materials = 0,
    services = 0,
    invalid = 0;
  for (const item of items.filter((i) => i.selected)) {
    const cents = lineAmount(item);
    if (cents === null) {
      invalid++;
      continue;
    }
    if (item.kind === "material") materials += cents;
    else services += cents;
  }
  return { materials, services, total: materials + services, invalid };
}
export class QuoteValidation extends Error {}
export function parseQuote(body: unknown): Quote {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new QuoteValidation("Orçamento inválido.");
  const b = body as Record<string, unknown>;
  const text = (v: unknown, max: number, required = false) => {
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      throw new QuoteValidation(
        "Confira os campos obrigatórios e o tamanho dos textos.",
      );
    return v.trim();
  };
  const company = text(b.company, 5);
  if (!["1", "2", "27404"].includes(company))
    throw new QuoteValidation("Empresa inválida.");
  if (!Array.isArray(b.items) || b.items.length > 1000)
    throw new QuoteValidation("Use até 1.000 itens por orçamento.");
  const items = b.items.map((value): QuoteItem => {
    if (!value || typeof value !== "object")
      throw new QuoteValidation("Item inválido.");
    const i = value as Record<string, unknown>;
    if (
      !["material", "service"].includes(String(i.kind)) ||
      typeof i.selected !== "boolean"
    )
      throw new QuoteValidation("Item inválido.");
    return {
      key: text(i.key, 200, true),
      kind: i.kind as QuoteItem["kind"],
      code: text(i.code, 100),
      name: text(i.name, 500),
      unit: text(i.unit, 60),
      quantity: text(i.quantity, 30),
      price: text(i.price, 30),
      selected: i.selected,
      source: text(i.source, 2000),
      referencePrice: text(i.referencePrice, 40),
      minimumPrice: text(i.minimumPrice, 40),
      lastPrice: text(i.lastPrice, 40),
      referenceAt: text(i.referenceAt, 80),
      ...(i.generalSale == null
        ? {}
        : {
            generalSale: (() => {
              if (
                typeof i.generalSale !== "object" ||
                Array.isArray(i.generalSale)
              )
                throw new QuoteValidation("Venda de referência inválida.");
              const sale = i.generalSale as Record<string, unknown>;
              return {
                company: text(sale.company, 5),
                order: text(sale.order, 30),
                ...(sale.orderNumber == null
                  ? {}
                  : { orderNumber: text(sale.orderNumber, 30) }),
                date: text(sale.date, 80),
                quantity: text(sale.quantity, 40),
                unitPrice: text(sale.unitPrice, 40),
                total: text(sale.total, 40),
                customer: text(sale.customer || "", 500),
              };
            })(),
          }),
    };
  });
  if (new Set(items.map((i) => i.key)).size !== items.length)
    throw new QuoteValidation("Há itens duplicados.");
  const selectedIdentities = items
    .filter((i) => i.selected)
    .map(quoteItemIdentity);
  if (new Set(selectedIdentities).size !== selectedIdentities.length)
    throw new QuoteValidation(
      "O mesmo material ou serviço não pode ser selecionado mais de uma vez.",
    );
  if (
    items.some(
      (i) =>
        i.selected &&
        lineAmount({
          ...i,
          quantity: i.quantity || "1",
          price: i.price || "0",
        }) === null,
    )
  )
    throw new QuoteValidation(
      "Informe quantidade positiva e preço válido em todos os itens selecionados (até 3 casas na quantidade e 2 no preço).",
    );
  if (
    b.id !== undefined &&
    (typeof b.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        b.id,
      ))
  )
    throw new QuoteValidation("Identificador inválido.");
  if (b.id && (!Number.isInteger(b.version) || Number(b.version) < 1))
    throw new QuoteValidation("Versão inválida.");
  if (
    b.equipmentId &&
    (typeof b.equipmentId !== "string" || !/^\d{1,18}$/.test(b.equipmentId))
  )
    throw new QuoteValidation("Equipamento inválido.");
  const clientId = text(b.clientId, 30);
  if (clientId && !/^\d+$/.test(clientId))
    throw new QuoteValidation("Cliente inválido.");
  return {
    id: b.id as string | undefined,
    version: b.version as number | undefined,
    company,
    clientId,
    client: text(b.client, 500),
    equipment: text(b.equipment, 500),
    equipmentId: b.equipmentId == null ? "" : text(b.equipmentId, 18),
    model: text(b.model, 80),
    serial: text(b.serial, 60),
    serviceType: text(b.serviceType, 200),
    interval: text(b.interval, 160),
    variant: text(b.variant, 64),
    notes: text(b.notes, 5000),
    responsible: b.responsible == null ? "" : text(b.responsible, 200),
    items,
  };
}

export type ManufacturerRecommendation = {
  interval_original?: string;
  interval_hours?: string | number | null;
  id: string;
  name: string;
  code: string;
  variant: string;
  interval: string;
  observation: string;
  issues: string[];
  products: CatalogProduct[];
  itemKeys: string[];
};

export type QuoteSale = {
  customer?: string;
  linkedByObservation?: boolean;
  company: string;
  order: string;
  orderNumber?: string;
  date: string;
  quantity: string;
  unitPrice: string;
  total: string;
};
export type QuoteSalesHistory = {
  count: number;
  minimum: string;
  maximum: string;
  rows: QuoteSale[];
};

/** ERP IDs are shared across companies; units and list origins do not create new items. */
export function quoteItemIdentity(item: QuoteItem): string {
  const code = item.code.trim();
  return code
    ? `${item.kind}:${item.key.startsWith("m:") ? "manufacturer:" : ""}${code}`
    : item.key;
}
