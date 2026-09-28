export type Recurrence = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  weekdays: number[];
  monthMode: "date" | "last_day";
  end: "never" | "count" | "until";
  count?: number;
  until?: string;
};
const dayMs = 86400000;
export function parseRecurrence(raw: any, anchor: string): Recurrence | null {
  if (raw == null || raw.frequency === "none") return null;
  if (
    !raw ||
    typeof raw !== "object" ||
    !["daily", "weekly", "monthly", "yearly"].includes(raw.frequency) ||
    !Number.isInteger(raw.interval) ||
    raw.interval < 1 ||
    raw.interval > 99
  )
    throw Error("Escolha uma frequência e um intervalo entre 1 e 99.");
  if (!["never", "count", "until"].includes(raw.end))
    throw Error("Escolha quando encerrar a recorrência.");
  if (
    raw.end === "count" &&
    (!Number.isInteger(raw.count) || raw.count < 1 || raw.count > 1000)
  )
    throw Error("Use de 1 a 1.000 ocorrências.");
  if (
    raw.end === "until" &&
    (typeof raw.until !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.until) ||
      !Number.isFinite(Date.parse(raw.until)) ||
      new Date(raw.until).toISOString().slice(0, 10) !== raw.until ||
      raw.until < anchor.slice(0, 10))
  )
    throw Error("A data final deve ser igual ou posterior ao primeiro alerta.");
  const weekdays = raw.frequency === "weekly" ? raw.weekdays : [];
  if (
    !Array.isArray(weekdays) ||
    weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    (raw.frequency === "weekly" && !weekdays.length)
  )
    throw Error("Selecione pelo menos um dia da semana.");
  if (raw.monthMode != null && !["date", "last_day"].includes(raw.monthMode))
    throw Error("Escolha uma regra mensal válida.");
  const start = new Date(anchor + "Z");
  if (raw.frequency === "weekly" && !weekdays.includes(start.getUTCDay()))
    throw Error(
      "Inclua o dia do primeiro alerta entre os dias da semana selecionados.",
    );
  return {
    frequency: raw.frequency,
    interval: raw.interval,
    weekdays: [...new Set<number>(weekdays)].sort(),
    monthMode: raw.monthMode || "date",
    end: raw.end,
    ...(raw.end === "count" ? { count: raw.count } : {}),
    ...(raw.end === "until" ? { until: raw.until } : {}),
  };
}
/** Calendar arithmetic on local dates; Brasília's current offset is UTC-03. */
export function occurrence(
  anchor: string,
  rule: Recurrence,
  index: number,
): string {
  const start = new Date(anchor + "Z"),
    date = new Date(start);
  if (index > 0) {
    if (rule.frequency === "daily")
      date.setUTCDate(start.getUTCDate() + index * rule.interval);
    else if (rule.frequency === "weekly") {
      const startDay = start.getUTCDay(),
        weekStart = new Date(start);
      weekStart.setUTCDate(start.getUTCDate() - ((startDay + 6) % 7));
      const days = rule.weekdays.map((d) => (d + 6) % 7).sort((a, b) => a - b);
      const remaining = days.filter((d) => d > (startDay + 6) % 7);
      let delta: number;
      if (index <= remaining.length) delta = remaining[index - 1];
      else {
        const n = index - remaining.length - 1;
        delta =
          (Math.floor(n / days.length) + 1) * rule.interval * 7 +
          days[n % days.length];
      }
      date.setTime(weekStart.getTime() + delta * dayMs);
    } else {
      const months =
        index * rule.interval * (rule.frequency === "yearly" ? 12 : 1);
      date.setUTCDate(1);
      date.setUTCMonth(start.getUTCMonth() + months);
      const last = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      date.setUTCDate(
        rule.frequency === "monthly" && rule.monthMode === "last_day"
          ? last
          : Math.min(start.getUTCDate(), last),
      );
    }
  }
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999)
    return "";
  return date.toISOString().slice(0, 16);
}
export function nextOccurrence(
  anchor: string,
  rule: Recurrence,
  afterIndex: number,
  afterInstant = 0,
): { when: string; index: number } | null {
  for (let index = afterIndex + 1; index <= 100000; index++) {
    if (rule.end === "count" && index >= rule.count!) return null;
    const local = occurrence(anchor, rule, index);
    if (!local) return null;
    if (rule.end === "until" && local.slice(0, 10) > rule.until!) return null;
    const when = new Date(local + "-03:00").toISOString();
    if (Date.parse(when) > afterInstant) return { when, index };
  }
  return null;
}
export function recurrenceLabel(rule: Recurrence | null): string {
  if (!rule) return "Não repetir";
  const units = {
    daily: "dia(s)",
    weekly: "semana(s)",
    monthly: "mês(es)",
    yearly: "ano(s)",
  };
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return `A cada ${rule.interval} ${units[rule.frequency]}${rule.frequency === "weekly" ? " · " + rule.weekdays.map((d) => days[d]).join(", ") : ""}${rule.frequency === "monthly" && rule.monthMode === "last_day" ? " · último dia do mês" : ""}${rule.end === "count" ? ` · ${rule.count} ocorrências` : rule.end === "until" ? ` · até ${rule.until!.split("-").reverse().join("/")}` : " · sem data final"}`;
}
