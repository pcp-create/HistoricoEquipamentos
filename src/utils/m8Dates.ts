import { Temporal } from '@js-temporal/polyfill';
import { SafeError } from './logger.js';

// User specified Brazilian local time; Brasília is the explicit deployment assumption.
export const DEFAULT_M8_TIME_ZONE = 'America/Sao_Paulo';
export function validateTimeZone(value: string): string {
  try {
    if (!/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(value)) throw new Error();
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch { throw new SafeError('M8_TIME_ZONE deve ser um fuso IANA válido, como America/Sao_Paulo'); }
}
export function m8Timestamp(value: string, timeZone = DEFAULT_M8_TIME_ZONE): string {
  validateTimeZone(timeZone);
  try {
    // Explicit offsets always preserve the instant originally sent by M8.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
      return Temporal.Instant.from(value).toString();
    }
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,9})?)?$/.test(value)) throw new Error();
    const local = value.length === 10 ? `${value}T00:00:00` : value;
    // Never silently shift nonexistent times or choose one of two ambiguous instants.
    return Temporal.ZonedDateTime.from(`${local}[${timeZone}]`, { disambiguation: 'reject', overflow: 'reject' }).toInstant().toString();
  } catch {
    throw new SafeError('Data M8 inválida ou ambígua/inexistente na transição de horário de verão; revisar registro na origem');
  }
}
