import { effectiveOperationStatus } from './model';

export function latestOpenProgramming(operations: any[]) {
  return [...operations].filter(o =>
    !['completed','reviewed'].includes(o.status) && /^\d{4}-\d{2}-\d{2}$/.test(o.date || '')
  ).sort((a,b) =>
    b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') ||
    Number(b.position || 0)-Number(a.position || 0) || String(b.id || '').localeCompare(String(a.id || ''))
  )[0];
}
export function latestProgrammingStatus(operation: any) {
  return effectiveOperationStatus(operation.status, {...operation, responsible: operation.responsibleEmail || operation.responsible});
}
