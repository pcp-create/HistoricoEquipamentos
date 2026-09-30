import {
  predict,
  estimateCurrentMeter,
  validDate,
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
  // Current usage belongs to the equipment, independently of each plan's history.
  const readings = [
    { meter: operating.meter, meterDate: operating.meterDate },
    ...plans.map(p => ({ meter: p.lastMeter, meterDate: p.lastDate })),
  ].filter(r => r.meter != null && Number.isFinite(r.meter) && r.meter >= 0
    && validDate(r.meterDate) && r.meterDate <= today)
    .sort((a, b) => b.meterDate.localeCompare(a.meterDate));
  const estimatedMeter = estimateCurrentMeter({ ...operating, ...readings[0] }, today, usage);
  const forecasts = plans.map(p => predict(p, operating, today, usage));
  const rows = plans.map((p, index) => {
    let target = forecasts[index].target;
    if (p.hours && p.hours > 0 && target != null && !forecasts[index].inconsistent) {
      const larger = plans.map((other, i) => ({ other, forecast: forecasts[i] }))
        .filter(({ other, forecast }) => other.hours != null && other.hours > p.hours!
          && other.hours % p.hours! === 0 && forecast.target != null
          && !forecast.incomplete && !forecast.inconsistent);
      // Advance along this plan's own sequence; never change the recorded intervention.
      while (larger.some(({ forecast }) => Math.abs(target! - forecast.target!) < 0.000001)) {
        target += p.hours;
      }
    }
    return {
      ...p,
      forecast: target === forecasts[index].target ? forecasts[index]
        : predict(p, operating, today, usage, target ?? undefined),
      coveredBy: null as null | { id?: string; name: string },
    };
  });
  for (const row of rows) row.forecast.estimatedMeter = estimatedMeter;
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
