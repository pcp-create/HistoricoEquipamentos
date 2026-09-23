import { parsePlanItems, type PlanItem } from "./plan-items";
export class EquipmentInputError extends Error {}
export const brazilToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dayMs = 86400000;
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
  );
}
const day = (s: string) => Date.parse(s + "T00:00:00Z");
const date = (n: number) =>
  Number.isFinite(n) && n >= 0 && n <= 253402214400000
    ? new Date(n).toISOString().slice(0, 10)
    : null;
export function addMonths(value: string, months: number) {
  const d = new Date(day(value));
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}
export type Operating = {
  hoursDay: number | null;
  daysYear: number | null;
  meter: number | null;
  meterDate: string;
  ownership: "unknown" | "customer" | "own";
  notes: string;
};
export type Plan = {
  items?: PlanItem[];
  name: string;
  hours: number | null;
  months: number | null;
  lastDate: string;
  lastMeter: number | null;
  notes: string;
  lastOrder: string;
};
export type RentalUsage = {
  intervals: { start: string; end: string | null }[];
  incomplete: boolean;
};
function workingDays(from: string, to: string, usage: RentalUsage) {
  const spans = usage.intervals
    .map((i) => [
      Math.max(day(from), day(i.start)),
      Math.min(day(to), i.end ? day(i.end) : day(to)),
    ])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    until = day(from);
  for (const [start, end] of spans) {
    total += Math.max(0, end - Math.max(start, until));
    until = Math.max(until, end);
  }
  return total / dayMs;
}
export function estimateCurrentMeter(
  operating: Operating,
  today = brazilToday(),
  usage?: RentalUsage,
) {
  if (
    operating.meter == null ||
    !Number.isFinite(operating.meter) ||
    operating.meter < 0 ||
    !validDate(operating.meterDate) ||
    !validDate(today) ||
    operating.meterDate > today
  )
    return null;
  if (operating.meterDate === today) return operating.meter;
  if (usage?.incomplete) return null;
  const elapsed = usage
    ? workingDays(operating.meterDate, today, usage)
    : (day(today) - day(operating.meterDate)) / dayMs;
  if (elapsed === 0) return operating.meter;
  const { hoursDay, daysYear } = operating;
  if (
    hoursDay == null ||
    daysYear == null ||
    !Number.isFinite(hoursDay) ||
    !Number.isFinite(daysYear) ||
    hoursDay <= 0 ||
    hoursDay > 24 ||
    daysYear < 1 ||
    daysYear > 365
  )
    return null;
  return operating.meter + (elapsed * hoursDay * daysYear) / 365;
}
export function predict(
  plan: Plan,
  operating: Operating,
  today = brazilToday(),
  usage?: RentalUsage,
) {
  const monthDate =
    plan.months && plan.lastDate ? addMonths(plan.lastDate, plan.months) : null;
  const target =
    plan.hours != null && plan.lastMeter != null
      ? plan.hours + plan.lastMeter
      : null;
  const rate =
    operating.hoursDay && operating.daysYear
      ? (operating.hoursDay * operating.daysYear) / 365
      : null;
  const useReading =
    operating.meter != null &&
    validDate(operating.meterDate) &&
    (!plan.lastDate || operating.meterDate >= plan.lastDate);
  const anchorDate = useReading ? operating.meterDate : plan.lastDate;
  const anchorMeter = useReading ? operating.meter : plan.lastMeter;
  const inconsistent =
    target != null &&
    anchorMeter != null &&
    plan.lastMeter != null &&
    anchorMeter < plan.lastMeter;
  const measuredDue =
    !inconsistent &&
    target != null &&
    anchorMeter != null &&
    anchorMeter >= target;
  const rentalMeter =
    usage && anchorMeter != null
      ? estimateCurrentMeter(
          { ...operating, meter: anchorMeter, meterDate: anchorDate },
          today,
          usage,
        )
      : null;
  const running = usage?.intervals.some(
    (i) => i.end === null && i.start <= today,
  );
  const hoursDate = usage
    ? measuredDue
      ? anchorDate
      : !inconsistent &&
          running &&
          rate &&
          target != null &&
          rentalMeter != null
        ? date(
            day(today) +
              Math.ceil(Math.max(0, target - rentalMeter) / rate) * dayMs,
          )
        : null
    : !inconsistent && target != null && anchorMeter != null && anchorDate
      ? measuredDue
        ? anchorDate
        : rate
          ? date(
              day(anchorDate) +
                Math.ceil((target - anchorMeter) / rate) * dayMs,
            )
          : null
      : null;
  const dates = [monthDate, hoursDate].filter((d): d is string => !!d).sort();
  const due = dates[0] || null;
  const days = due ? Math.round((day(due) - day(today)) / dayMs) : null;
  const estimatedMeter = usage
    ? !inconsistent
      ? rentalMeter
      : null
    : !inconsistent &&
        anchorMeter != null &&
        anchorDate &&
        (rate || anchorDate === today)
      ? anchorMeter +
        (rate || 0) * Math.max(0, (day(today) - day(anchorDate)) / dayMs)
      : null;
  const incomplete = !!(
    (plan.months && !monthDate) ||
    (plan.hours && !hoursDate)
  );
  return {
    due,
    days,
    target,
    monthDate,
    hoursDate,
    estimatedMeter,
    measuredDue,
    incomplete,
    inconsistent,
    status: measuredDue
      ? "due"
      : days != null && days < 0
        ? "overdue"
        : days === 0
          ? "due"
          : incomplete
            ? "incomplete"
            : days != null && days <= 30
              ? "soon"
              : "scheduled",
    basis: due === hoursDate ? "hours" : "months",
  };
}
const text = (v: unknown, max: number) => {
  if (typeof v !== "string" || v.length > max)
    throw new EquipmentInputError("Confira os textos informados.");
  return v.trim();
};
const number = (
  v: unknown,
  max: number,
  integer = false,
  min = 0,
): number | null => {
  if (v === "" || v == null) return null;
  if (typeof v !== "string" && typeof v !== "number")
    throw new EquipmentInputError("Número inválido.");
  const raw = String(v).replace(",", ".");
  const n = Number(raw);
  if (
    !/^\d+(\.\d{1,3})?$/.test(raw) ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new EquipmentInputError("Valor numérico fora do limite.");
  return n;
};
const pastDate = (v: unknown) => {
  const s = text(v ?? "", 10);
  if (s && (!validDate(s) || s > brazilToday()))
    throw new EquipmentInputError("Informe uma data válida, até hoje.");
  return s;
};
export function parseOperating(v: any): Operating {
  if (!v || typeof v !== "object")
    throw new EquipmentInputError("Dados inválidos.");
  if (!["unknown", "customer", "own"].includes(v.ownership))
    throw new EquipmentInputError("Classificação inválida.");
  const r = {
    ownership: v.ownership,
    hoursDay: number(v.hoursDay, 24, false, 0.001),
    daysYear: number(v.daysYear, 365, true, 1),
    meter: number(v.meter, 100000000),
    meterDate: pastDate(v.meterDate),
    notes: text(v.notes ?? "", 3000),
  };
  if ((r.meter == null) !== !r.meterDate)
    throw new EquipmentInputError(
      "Informe juntos horímetro e data da leitura.",
    );
  return r;
}
export function parsePlan(v: any): Plan {
  if (!v || typeof v !== "object")
    throw new EquipmentInputError("Plano inválido.");
  const r = {
    items: (() => {
      try {
        return parsePlanItems(v.items);
      } catch (e) {
        throw new EquipmentInputError((e as Error).message);
      }
    })(),
    name: text(v.name, 160),
    hours: number(v.hours, 1000000, false, 0.001),
    months: number(v.months, 1200, true, 1),
    lastDate: pastDate(v.lastDate),
    lastMeter: number(v.lastMeter, 100000000),
    notes: text(v.notes ?? "", 3000),
    lastOrder: text(v.lastOrder ?? "", 30),
  };
  if (!r.name || (!r.hours && !r.months))
    throw new EquipmentInputError(
      "Informe nome e intervalo em horas ou meses.",
    );
  if (r.lastMeter != null && !r.lastDate)
    throw new EquipmentInputError(
      "Informe a data da intervenção para o horímetro.",
    );
  if (r.lastOrder && !/^[1-9]\d{0,17}$/.test(r.lastOrder))
    throw new EquipmentInputError("Informe apenas o número da OS.");
  return r;
}
export function parseIntervention(v: any) {
  const r = {
    date: pastDate(v?.date),
    meter: number(v?.meter, 100000000),
    order: text(v?.order ?? "", 30),
    notes: text(v?.notes ?? "", 3000),
  };
  if (!r.date) throw new EquipmentInputError("Informe a data da manutenção.");
  if (r.order && !/^[1-9]\d{0,17}$/.test(r.order))
    throw new EquipmentInputError("Informe apenas o número da OS.");
  return r;
}
export const emptyOperating: Operating = {
  ownership: "unknown",
  hoursDay: null,
  daysYear: null,
  meter: null,
  meterDate: "",
  notes: "",
};

/** A completed larger revision includes every smaller hourly plan. */
export function cascadeIntervention(plan: Plan, source: Plan): Plan | null {
  if (
    !plan.hours ||
    !source.hours ||
    plan.hours >= source.hours ||
    !source.lastDate
  )
    return null;
  if (plan.lastDate && plan.lastDate >= source.lastDate) return null;
  if (
    plan.lastMeter != null &&
    source.lastMeter != null &&
    plan.lastMeter > source.lastMeter
  )
    return null;
  return {
    ...plan,
    lastDate: source.lastDate,
    lastMeter: source.lastMeter,
    lastOrder: source.lastOrder,
  };
}

export function preventiveMonths(hours: number | null): number | null {
  if (hours === 2000) return 6;
  if (hours === 4000) return 12;
  if (hours === 8000) return 24;
  if (hours != null && hours >= 20000) return 60;
  return null;
}
