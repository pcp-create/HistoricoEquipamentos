type ForecastPlan = {
  id: string;
  document: { hours?: number | null };
  forecast: { due?: string | null; target?: number | null; coveredBy?: unknown; inconsistent?: boolean };
};
const forecastDate = (value: string | null | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

/** ISO forecast dates sort consistently without browser-specific date parsing. */
export function orderPreventivePlans<T extends ForecastPlan>(plans: T[]): T[] {
  return [...plans].sort((a, b) => {
    const left = forecastDate(a.forecast.due), right = forecastDate(b.forecast.due);
    if (left !== right) {
      if (!left) return 1;
      if (!right) return -1;
      return left < right ? -1 : 1;
    }
    const aTarget = a.forecast.target ?? Infinity, bTarget = b.forecast.target ?? Infinity;
    if (aTarget !== bTarget) return aTarget < bTarget ? -1 : 1;
    const interval = Number(b.document.hours || 0) - Number(a.document.hours || 0);
    if (interval) return interval;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
}
export function nextPreventivePlanId(plans: ForecastPlan[]) {
  return orderPreventivePlans(plans).find(p =>
    !!forecastDate(p.forecast.due) && !p.forecast.coveredBy && !p.forecast.inconsistent
  )?.id;
}
