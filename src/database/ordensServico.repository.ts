import { schemas, type EntitySchema, type FieldType } from './schema.js';
import { transaction, type Database } from './postgres.js';
import { record, id } from '../m8/ordemServico.js';
import type { M8OrdemServicoCompleta } from '../m8/types.js';
import { SafeError } from '../utils/logger.js';
import { m8Timestamp, DEFAULT_M8_TIME_ZONE } from '../utils/m8Dates.js';

function scalar(value: unknown, type: FieldType, field: string, timeZone: string): unknown {
  if (value === null) return null;
  if (type === 'enum_text' && (typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value)))) return String(value);
  if (type === 'bigint') return id(value);
  if (type === 'numeric' && (typeof value === 'string' || typeof value === 'number') && /^-?\d+(\.\d+)?$/.test(String(value)) && Number.isFinite(Number(value))) return String(value);
  if (type === 'text' && typeof value === 'string') return value;
  if (type === 'boolean' && typeof value === 'boolean') return value;
  if (type === 'timestamptz' && typeof value === 'string') return m8Timestamp(value, timeZone);
  throw new SafeError(`Tipo inesperado no campo ${field}; valide o contrato M8 (valor omitido)`);
}
export function mapEntity(schema: EntitySchema, source: Record<string, unknown>, company: number, parent?: string, timeZone = DEFAULT_M8_TIME_ZONE): Record<string, unknown> {
  const result: Record<string, unknown> = { company_id: company, id_m8: id(source.id) };
  if (parent !== undefined) result.ordem_servico_id = parent;
  for (const [column, field, type] of schema.fields) {
    if (source[field] !== undefined) result[column] = scalar(source[field], type, field, timeZone);
  }
  result.payload = JSON.stringify(source);
  return result;
}
// Identifiers only come from the static schema/locally authored maintenance row.
export async function upsert(db: Database, table: string, row: Record<string, unknown>, keys: string[]): Promise<boolean> {
  const columns = Object.keys(row);
  const update = columns.filter(key => !keys.includes(key)).map(key => `${key}=EXCLUDED.${key}`);
  const result = await db.query<{ inserted: boolean }>(
    `INSERT INTO public.${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})
     ON CONFLICT (${keys.join(',')}) DO UPDATE SET ${update.join(',')}, sincronizado_em=now(), updated_at=now()
     RETURNING (xmax = 0) AS inserted`, Object.values(row));
  return result.rows[0]?.inserted === true;
}
export interface PageStats { received: number; inserted: number; updated: number }
export async function persistPage(db: Database, company: number, orders: M8OrdemServicoCompleta[], logId: string, page: number, timeZone = DEFAULT_M8_TIME_ZONE): Promise<PageStats> {
  return transaction(db, async () => {
    const stats: PageStats = { received: orders.length, inserted: 0, updated: 0 };
    for (const order of orders) {
      const parent = id(order.id);
      for (const schema of schemas) {
        const value = schema.collection === null ? order : order[schema.collection];
        if (value == null) continue;
        let rows: unknown[];
        if (schema.collection === null) rows = [order];
        else if (schema.collection === 'equipamentoProduto') {
          if (!record(value)) throw new SafeError('equipamentoProduto não é objeto');
          rows = Object.keys(value).length ? [value] : [];
        } else {
          if (!Array.isArray(value)) throw new SafeError(`Coleção ${schema.collection} não é array`);
          rows = value;
        }
        const seen = new Set<string>();
        for (const source of rows) {
          if (!record(source)) throw new SafeError(`Registro inválido em ${schema.table}`);
          const childId = id(source.id);
          if (seen.has(childId)) throw new SafeError(`ID duplicado em ${schema.table}; validar chave da coleção`);
          seen.add(childId);
          const row = mapEntity(schema, source, company, schema.collection === null ? undefined : parent, timeZone);
          const inserted = await upsert(db, schema.table, row, schema.collection === null ? ['company_id', 'id_m8'] : ['company_id', 'ordem_servico_id', 'id_m8']);
          // Counters refer to OS, not children, and match committed pages.
          if (schema.collection === null) { if (inserted) stats.inserted++; else stats.updated++; }
        }
      }
      if (order.manutencao != null) {
        if (!record(order.manutencao)) throw new SafeError('manutencao não é objeto; validar contrato M8');
        await upsert(db, 'm8_os_manutencao', { company_id: company, ordem_servico_id: parent, payload: JSON.stringify(order.manutencao) }, ['company_id', 'ordem_servico_id']);
      }
    }
    await db.query(`UPDATE public.integracao_m8_log SET pagina_atual=$2, paginas_processadas=paginas_processadas+1,
      registros_recebidos=registros_recebidos+$3, registros_inseridos=registros_inseridos+$4,
      registros_atualizados=registros_atualizados+$5 WHERE id=$1`, [logId, page, stats.received, stats.inserted, stats.updated]);
    return stats;
  });
}
