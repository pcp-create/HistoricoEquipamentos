import type { M8OrdemServicoCompleta } from './types.js';
import type { M8Client } from './client.js';
import { SafeError } from '../utils/logger.js';
export const ORDERS_ENDPOINT = '/v1/assistenciatecnica/ordemservicocompleta';
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function id(value: unknown): string {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new SafeError('ID M8 numérico inválido ou sem precisão');
  if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value))) throw new SafeError('ID M8 ausente/inválido; página não persistida');
  const normalized = BigInt(String(value));
  if (normalized > 9223372036854775807n) throw new SafeError('ID M8 fora do limite bigint PostgreSQL');
  return normalized.toString();
}
export function parseOrders(body: unknown): M8OrdemServicoCompleta[] {
  if (!record(body) || !Array.isArray(body.data)) throw new SafeError('Contrato M8 inesperado: esperado objeto com data[]');
  if (body.errors != null && (!Array.isArray(body.errors) || body.errors.length > 0)) throw new SafeError('M8 retornou errors; página recusada (conteúdo omitido)');
  const seen = new Set<string>();
  for (const row of body.data) {
    if (!record(row)) throw new SafeError('OS deve ser um objeto');
    const key = id(row.id);
    if (seen.has(key)) throw new SafeError('IDs de OS repetidos na mesma página; validar paginação M8');
    seen.add(key);
  }
  // Detailed scalar and nested validation happens before database writes.
  return body.data as M8OrdemServicoCompleta[];
}
export async function fetchOrders(client: Pick<M8Client, 'get'>, page: number, pageSize: number, filters: Record<string, string> = {}) {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) throw new SafeError('Page e PageSize devem ser positivos');
  const rows = parseOrders(await client.get(ORDERS_ENDPOINT, { ...filters, Page: page, PageSize: pageSize }));
  if (rows.length > pageSize) throw new SafeError('M8 retornou mais registros que PageSize; paginação não respeitada');
  return rows;
}
