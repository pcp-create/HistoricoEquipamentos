import {
  addMonths,
  brazilToday,
  validDate,
} from "../equipment-management/planning";
export { brazilToday, validDate };
export class InspectionInputError extends Error {}
export class InspectionConflict extends Error {}
export function inspectionForecast(
  plan: {
    last_date?: string | null;
    baseline_date?: string | null;
    first_due?: string | null;
    interval_value: number;
    interval_unit: string;
    notice_days: number;
  },
  today = brazilToday(),
) {
  const last =
    plan.last_date &&
    (!plan.baseline_date || plan.last_date > plan.baseline_date)
      ? plan.last_date
      : plan.baseline_date;
  const due = last
    ? plan.interval_unit === "months"
      ? addMonths(last, plan.interval_value)
      : new Date(
          Date.parse(last + "T00:00:00Z") + plan.interval_value * 86400000,
        )
          .toISOString()
          .slice(0, 10)
    : plan.first_due || null;
  const remaining = due
    ? Math.round(
        (Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) /
          86400000,
      )
    : null;
  return {
    lastDate: last || null,
    due,
    days: remaining,
    status:
      remaining === null
        ? "incomplete"
        : remaining < 0
          ? "overdue"
          : remaining === 0
            ? "due"
            : remaining <= plan.notice_days
              ? "soon"
              : "scheduled",
  };
}
export function collectionDate(document: any) {
  const values: string[] = [];
  for (const e of document?.equipments || []) {
    if (e.selected === false) continue;
    // Equipment date is the collection date. Component dates are fallback measurement dates.
    for (const raw of [
      e.date,
      ...(e.components || []).map((c: any) => c.date),
    ]) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      let date = raw.trim();
      const br = date.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
      if (br) date = `${br[3]}-${br[2]}-${br[1]}`;
      if (!validDate(date))
        throw new InspectionInputError(
          "Confira as datas de coleta do relatório (DD/MM/AAAA ou AAAA-MM-DD).",
        );
      if (date > brazilToday())
        throw new InspectionInputError("A coleta não pode ter data futura.");
      values.push(date);
    }
  }
  if (!values.length)
    throw new InspectionInputError(
      "Preencha a data da coleta nas máquinas do relatório antes de registrar a inspeção.",
    );
  return values.sort().at(-1)!;
}
