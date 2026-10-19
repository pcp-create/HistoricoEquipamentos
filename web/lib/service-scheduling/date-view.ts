import {matchesDeliveryProjection} from './delivery-projection';
import {effectiveOperationStatus} from './model';
export type ScheduleDateView = 'delivery' | 'operation';
export function operationDates(operation: any): string[] {
  return (operation.dates?.length ? operation.dates : [operation.date || ''])
    .filter((date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date));
}
/** Filter the operations themselves so calendar, map and totals share one period. */
export function filterScheduleDateView(schedule: any, view: ScheduleDateView, month: string, executor = '') {
  if (view === 'delivery' && !matchesDeliveryProjection(schedule, month)) return null;
  const operations = (schedule.calendar_operations || []).filter((operation: any) =>
    (!executor || operation.responsibleEmail === executor || (operation.support || []).includes(executor)) &&
    (view !== 'operation' || !month || operationDates(operation).some(date => date.startsWith(month + '-'))));
  if ((executor || (view === 'operation' && month)) && !operations.length) return null;
  if (view === 'delivery') return {...schedule, calendar_operations: operations};
  const counts: Record<string, number> = {};
  for (const operation of operations) {
    const status = effectiveOperationStatus(operation.status, {...operation, responsible: operation.responsibleEmail});
    counts[status] = (counts[status] || 0) + 1;
  }
  return {...schedule, calendar_operations: operations, operation_count: operations.length, operation_status_counts: counts};
}
