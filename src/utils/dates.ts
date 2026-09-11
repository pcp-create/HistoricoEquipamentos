import { SafeError } from './logger.js';
export function parseDate(value: string, endOfDay = false): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new SafeError('Data inválida; use YYYY-MM-DD ou ISO 8601 com fuso');
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    return date;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new SafeError('Data/hora sem fuso ou formato inválido; confirme o fuso M8 antes de importar');
  }
  // Date.parse normalizes dates such as February 30; reject these explicitly.
  parseDate(value.slice(0, 10));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new SafeError('Data inválida');
  return date;
}
export interface Window { from: Date; to: Date }
export function* monthWindows(from: Date, to: Date, months = 1): Generator<Window> {
  if (from > to) throw new SafeError('Período inicial posterior ao final');
  if (!Number.isInteger(months) || months < 1) throw new SafeError('Intervalo mensal inválido');
  let cursor = new Date(from);
  while (cursor < to) {
    const boundary = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + months, 1));
    const end = boundary < to ? boundary : to;
    // Boundary belongs to both windows: conservative overlap, handled by UPSERT.
    yield { from: cursor, to: new Date(end) };
    cursor = new Date(end);
  }
  if (from.getTime() === to.getTime()) yield { from, to };
}
