import { fold, parseFilters } from "./filters";

export interface AnalysisFilters {
  from: string;
  to: string;
  company: string;
  q: string;
  unit: string;
  sort: "frequency" | "quantity";
  page: number;
  size: number;
  lead: number | null;
  safety: number;
  review: number;
  days: number;
}
export interface Consumption {
  company_id: number;
  product_id: string;
  unit_key: string;
  unit: string | null;
  name: string;
  reference: string | null;
  quantity: number;
  orders: number;
  active_days: number;
  last_used: string;
  first_used: string;
}
export interface Coverage {
  company_id: number;
  eligible: number;
  complete: number;
  ignored_items: number;
  undated: number;
}
export interface PlannedMaterial extends Consumption {
  daily: number;
  monthly: number;
  frequency_monthly: number;
  minimum: number | null;
  maximum: number | null;
  reason: string | null;
}
export function brazilToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function offsetDate(day: string, offset: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function parseAnalysis(
  params: URLSearchParams,
  now = new Date(),
): AnalysisFilters {
  const base = parseFilters(params),
    today = brazilToday(now);
  const to = base.to || offsetDate(today, -1),
    from = base.from || offsetDate(to, -179);
  if (from > to || to >= today)
    throw new Error(
      "Use um período encerrado até ontem, com início anterior ao fim.",
    );
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days > 36525) throw new Error("O período é muito longo.");
  const integer = (
    key: string,
    fallback: number | null,
    max: number,
    min = 0,
  ) => {
    const text = params.get(key);
    if (text === null || text === "") return fallback;
    const value = Number(text);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error("Confira os dias de reposição, segurança e revisão.");
    return value;
  };
  const unit = (params.get("unit") || "").slice(0, 120);
  const sort = params.get("sort") === "quantity" ? "quantity" : "frequency";
  if (sort === "quantity" && (!unit || unit === "(sem unidade)"))
    throw new Error("Selecione uma unidade para comparar quantidades.");
  return {
    from,
    to,
    company: base.company,
    q: base.q,
    unit,
    sort,
    page: base.page,
    size: base.size,
    lead: integer("lead", 7, 365),
    safety: integer("safety", 7, 365)!,
    review: integer("review", 30, 365, 1)!,
    days,
  };
}
export function planMaterial(
  row: Consumption,
  filters: AnalysisFilters,
  coverage: Coverage | undefined,
): PlannedMaterial {
  const daily = row.quantity / filters.days;
  let reason: string | null = null;
  if (filters.lead === null) reason = "Informe o prazo de reposição";
  else if (
    !coverage ||
    coverage.eligible === 0 ||
    coverage.complete < coverage.eligible
  )
    reason = "Aguardando importação completa da empresa";
  else if (coverage.undated > 0)
    reason = "Há OS processadas sem data nesta empresa";
  else if (coverage.ignored_items > 0)
    reason = "Revisar itens com quantidade ou código inválidos";
  else if (filters.days < 30 || row.orders < 3 || row.active_days < 3)
    reason = "Amostra pequena: mínimo de 30 dias e 3 dias de aplicação";
  else if (!row.unit) reason = "Unidade não informada";
  const pieceUnit =
    /^(UN|UND|UNID|UNIDADE|UNIDADES|PC|PCS|PÇ|PÇS|PECA|PECAS)$/i.test(
      fold(row.unit || ""),
    );
  const roundUp = (value: number) =>
    Math.ceil((value - Number.EPSILON) * (pieceUnit ? 1 : 100)) /
    (pieceUnit ? 1 : 100);
  return {
    ...row,
    daily,
    monthly: daily * 30,
    frequency_monthly: (row.orders / filters.days) * 30,
    minimum: reason ? null : roundUp(daily * (filters.lead! + filters.safety)),
    maximum: reason
      ? null
      : roundUp(daily * (filters.lead! + filters.safety + filters.review)),
    reason,
  };
}
export function summarizeMaterials(
  rows: Consumption[],
  coverage: Coverage[],
  filters: AnalysisFilters,
) {
  const units = [...new Set(rows.map((row) => row.unit_key))].sort();
  const terms = fold(filters.q).split(/\s+/).filter(Boolean);
  const filtered = rows.filter(
    (row) =>
      (!filters.unit || row.unit_key === filters.unit) &&
      terms.every((term) =>
        fold(
          [
            row.product_id,
            row.name,
            row.reference,
            row.unit,
            row.company_id,
          ].join(" "),
        ).includes(term),
      ),
  );
  const planned = filtered.map((row) =>
    planMaterial(
      row,
      filters,
      coverage.find((c) => c.company_id === row.company_id),
    ),
  );
  const compare = (a: PlannedMaterial, b: PlannedMaterial) =>
    a.company_id - b.company_id ||
    a.product_id.localeCompare(b.product_id) ||
    a.unit_key.localeCompare(b.unit_key);
  planned.sort((a, b) =>
    filters.sort === "quantity"
      ? b.quantity - a.quantity || b.orders - a.orders || compare(a, b)
      : b.orders - a.orders || b.active_days - a.active_days || compare(a, b),
  );
  const topFrequency = [...planned]
    .sort((a, b) => b.orders - a.orders || compare(a, b))
    .slice(0, 8);
  const topQuantity =
    filters.unit && filters.unit !== "(sem unidade)"
      ? [...planned]
          .sort((a, b) => b.quantity - a.quantity || compare(a, b))
          .slice(0, 8)
      : [];
  return { planned, units, topFrequency, topQuantity };
}
