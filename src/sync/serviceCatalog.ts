import type { M8Client } from '../m8/client.js';
import { listData, uniqueRows } from '../m8/collections.js';
import { id } from '../m8/ordemServico.js';
import { transaction, type Database } from '../database/postgres.js';
import { SafeError, log } from '../utils/logger.js';

export function serviceRows(body: unknown) {
  return uniqueRows(listData(body)).map(row => {
    if (typeof row.nome !== 'string' || !row.nome.trim()) throw new SafeError('Serviço sem nome no cadastro');
    for (const key of ['precoVenda','precoVendaMinimo'])
      if (row[key] != null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]))) throw new SafeError('Preço de serviço inválido');
    return { service_id: id(row.id), name: row.nome, unit: row.unidadeNome ?? null,
      internal_code: row.codigoIdentificacaoInterno ?? null, sale_price: row.precoVenda ?? null,
      minimum_price: row.precoVendaMinimo ?? null, payload: row };
  });
}
export async function syncServices(client: Pick<M8Client, 'get' | 'company'>, db: Database) {
  const lock = (await db.query('SELECT pg_try_advisory_lock(81017,$1) AS acquired', [client.company])).rows[0];
  if (!lock?.acquired) return;
  try {
    const at = new Date().toISOString();
    const rows = serviceRows(await client.get('/v1/estoque/servico', { Page: 0, PageSize: 0 }));
    // Never remove previous records on an empty or incomplete ERP response.
    await transaction(db, async () => {
      await db.query(`INSERT INTO public.m8_service_catalog
        SELECT $1,r.service_id,r.name,r.unit,r.internal_code,r.sale_price,r.minimum_price,$3,r.payload
        FROM jsonb_to_recordset($2::jsonb) AS r(service_id bigint,name text,unit text,internal_code text,sale_price numeric,minimum_price numeric,payload jsonb)
        ON CONFLICT(company_id,service_id) DO UPDATE SET name=EXCLUDED.name,unit=EXCLUDED.unit,internal_code=EXCLUDED.internal_code,
          sale_price=EXCLUDED.sale_price,minimum_price=EXCLUDED.minimum_price,collected_at=EXCLUDED.collected_at,payload=EXCLUDED.payload`,
        [client.company, JSON.stringify(rows), at]);
    });
    log('SERVICOS', 'Cadastro de serviços atualizado', { company: client.company, count: rows.length });
  } finally { await db.query('SELECT pg_advisory_unlock(81017,$1)', [client.company]); }
}
