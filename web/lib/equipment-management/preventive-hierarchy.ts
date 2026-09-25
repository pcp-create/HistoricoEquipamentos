import {
  predict,
  brazilToday,
  type Plan,
  type Operating,
  type RentalUsage,
} from "./planning";
export const isPreventiveAlert = (status: string) =>
  ["due", "overdue", "soon"].includes(status);
/** Hourly revisions include smaller hourly revisions, as cascadeIntervention does.
 * Only actionable forecasts may cover another alert; unknown/future work never hides one.
 */
export function predictPlans<T extends Plan & { id?: string }>(
  plans: T[],
  operating: Operating,
  today = brazilToday(),
  usage?: RentalUsage,
) {
  const rows = plans.map((p) => ({
    ...p,
    forecast: predict(p, operating, today, usage),
    coveredBy: null as null | { id?: string; name: string },
  }));
  const candidates = rows.filter(
    (p) =>
      p.hours &&
      isPreventiveAlert(p.forecast.status) &&
      !p.forecast.inconsistent,
  );
  const largest = [...candidates].sort(
    (a, b) =>
      b.hours! - a.hours! || (a.id || a.name).localeCompare(b.id || b.name),
  )[0];
  if (largest)
    for (const p of candidates) {
      if (p !== largest && p.hours! <= largest.hours!)
        p.coveredBy = { id: largest.id, name: largest.name };
    }
  return rows;
}
/** A new actual intervention begins a new occurrence; merely reaching a larger
 * revision changes the scope of the existing task, without opening another one. */
export function preventiveCycle(plans: Plan[]) {
  const latest = [...plans]
    .filter((p) => p.lastDate)
    .sort(
      (a, b) =>
        b.lastDate.localeCompare(a.lastDate) ||
        (b.lastMeter ?? -1) - (a.lastMeter ?? -1) ||
        b.lastOrder.localeCompare(a.lastOrder),
    )[0];
  return JSON.stringify(
    latest
      ? [latest.lastDate, latest.lastOrder, latest.lastMeter]
      : [null, null, null],
  );
}
