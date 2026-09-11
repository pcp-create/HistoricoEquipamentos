export type View = "orders" | "materials";
export interface Filters {
  q: string;
  company: string;
  status: string;
  client: string;
  equipment: string;
  model: string;
  serial: string;
  exactSerial?: string;
  product: string;
  productId?: string;
  from: string;
  to: string;
  page: number;
  size: number;
  view: View;
}
export function parseFilters(params: URLSearchParams): Filters {
  const text = (key: string, max = 120) =>
    (params.get(key) || "").trim().slice(0, max);
  const date = (key: string) => {
    const value = text(key, 10);
    if (!value) return "";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new Error("Período inválido");
    return value;
  };
  const company = text("company");
  const productId = text("productId", 30);
  if (productId && !/^[1-9]\d{0,17}$/.test(productId))
    throw new Error("Código de produto inválido");
  if (text("q", 200).split(/\s+/).filter(Boolean).length > 12)
    throw new Error("Use até 12 palavras na pesquisa");
  if (company && !["1", "2", "27404"].includes(company))
    throw new Error("Empresa inválida");
  const from = date("from"),
    to = date("to");
  if (from && to && from > to)
    throw new Error("A data inicial deve ser anterior à final");
  const page = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    throw new Error("Página inválida");
  return {
    q: text("q", 200),
    company,
    status: text("status"),
    client: text("client"),
    equipment: text("equipment"),
    model: text("model"),
    serial: text("serial"),
    exactSerial: text("exactSerial")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ""),
    product: text("product"),
    productId,
    from,
    to,
    page,
    size: [25, 50, 100].includes(Number(params.get("size")))
      ? Number(params.get("size"))
      : 25,
    view: params.get("view") === "materials" ? "materials" : "orders",
  };
}
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
export const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
