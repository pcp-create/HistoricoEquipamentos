import type { M8Client } from '../m8/client.js';
import { listData } from '../m8/collections.js';
import { id } from '../m8/ordemServico.js';
import { transaction, type Database } from '../database/postgres.js';
import { m8Timestamp } from '../utils/m8Dates.js';
import { SafeError, log, safeError } from '../utils/logger.js';
export type ProductMode = 'catalog' | 'available' | 'detail';
export function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new SafeError('Valor numérico de produto inválido');
  return value;
}
export function stockRows(body: unknown, requested: string[]) {
  const rows = listData(body),
    keys = new Set<string>();
  for (const row of rows) {
    const product = id(row.produtoId),
      establishment = id(row.estabelecimentoId);
    if (!requested.includes(product) || keys.has(`${product}:${establishment}`))
      throw new SafeError(
        'Estoque com produto inesperado ou estabelecimento duplicado',
      );
    keys.add(`${product}:${establishment}`);
    numberOrNull(row.estoqueDisponivel);
  }
  // Missing is unknown, never zero; retain previous snapshot and retry later.
  if (
    requested.some(
      (product) => !rows.some((row) => id(row.produtoId) === product),
    )
  )
    throw new SafeError(
      'Resposta de estoque incompleta; saldo anterior preservado',
    );
  return rows;
}
export function mergeCatalog(
  target: Map<string, Record<string, unknown>>,
  rows: Record<string, unknown>[],
) {
  for (const row of rows) {
    const product = id(row.id),
      old = target.get(product);
    const core = (r: Record<string, unknown>) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(r)
            .filter(([key]) => !['localizacao', 'localizacoes'].includes(key))
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      );
    if (old && core(old) !== core(row))
      throw new SafeError(
        'Produto repetido diverge além da localização; cadastro não atualizado',
      );
    const locations = new Set(
      [...((old?.localizacoes as unknown[]) || []), row.localizacao].filter(
        (v) => v != null,
      ),
    );
    target.set(product, { ...row, localizacoes: [...locations] });
  }
}
export async function saveAvailability(
  db: Database,
  company: number,
  requested: string[],
  body: unknown,
  at: string,
) {
  const rows = stockRows(body, requested);
  await transaction(db, async () => {
    await db.query(
      'SELECT product_id FROM public.m8_product_catalog WHERE company_id=$1 AND product_id=ANY($2::bigint[]) ORDER BY product_id FOR UPDATE',
      [company, requested],
    );
    const newer = await db.query(
      'SELECT DISTINCT product_id::text FROM public.m8_product_available WHERE company_id=$1 AND product_id=ANY($2::bigint[]) AND collected_at>$3',
      [company, requested, at],
    );
    const eligible = requested.filter(
      (product) => !newer.rows.some((row) => row.product_id === product),
    );
    await db.query(
      'DELETE FROM public.m8_product_available WHERE company_id=$1 AND product_id=ANY($2::bigint[])',
      [company, eligible],
    );
    await db.query(
      `INSERT INTO public.m8_product_available SELECT $1,p.product_id,p.establishment_id,p.available,$3 FROM jsonb_to_recordset($2::jsonb) AS p(product_id bigint,establishment_id bigint,available numeric)`,
      [
        company,
        JSON.stringify(
          rows
            .filter((row) => eligible.includes(id(row.produtoId)))
            .map((row) => ({
              product_id: id(row.produtoId),
              establishment_id: id(row.estabelecimentoId),
              available: numberOrNull(row.estoqueDisponivel),
            })),
        ),
        at,
      ],
    );
  });
}
async function collectDetailBatch(
  client: Pick<M8Client, 'get' | 'company'>,
  db: Database,
  requested: string[],
  at: string,
) {
  const company = client.company;
  await db.query(
    'UPDATE public.m8_product_stock_queue SET attempted_at=now() WHERE company_id=$1 AND product_id=ANY($2::bigint[])',
    [company, requested],
  );
  const groups: { product: string; rows: Record<string, unknown>[] }[] = [];
  let failures = 0;
  // Only two ERP requests at once; all database writes share one transaction below.
  for (let offset = 0; offset < requested.length; offset += 2) {
    const results = await Promise.allSettled(
      requested.slice(offset, offset + 2).map(async (product) => {
        const rows = stockRows(
          await client.get(`/v1/estoque/produto/${product}/estoque`, {
            Page: 0,
            PageSize: 0,
          }),
          [product],
        );
        for (const row of rows)
          for (const key of [
            'estoque',
            'estoqueDisponivel',
            'valorCustoMedioAtual',
            'valorVendaEstabelecimento',
          ])
            numberOrNull(row[key]);
        return { product, rows };
      }),
    );
    for (const result of results)
      if (result.status === 'fulfilled') groups.push(result.value);
      else {
        failures++;
        log('PRODUTOS', safeError(result.reason), { company, mode: 'detail' });
      }
  }
  if (!groups.length) return { processed: 0, failures };
  const ids = groups.map((g) => g.product),
    rows = groups.flatMap((g) =>
      g.rows.map((row) => ({
        product_id: g.product,
        establishment_id: id(row.estabelecimentoId),
        establishment_name: row.estabelecimentoNome ?? null,
        stock: numberOrNull(row.estoque),
        available: numberOrNull(row.estoqueDisponivel),
        average_cost: numberOrNull(row.valorCustoMedioAtual),
        establishment_price: numberOrNull(row.valorVendaEstabelecimento),
        payload: row,
      })),
    );
  await transaction(db, async () => {
    await db.query(
      'SELECT product_id FROM public.m8_product_catalog WHERE company_id=$1 AND product_id=ANY($2::bigint[]) ORDER BY product_id FOR UPDATE',
      [company, ids],
    );
    await db.query(
      'DELETE FROM public.m8_product_stock WHERE company_id=$1 AND product_id=ANY($2::bigint[])',
      [company, ids],
    );
    await db.query(
      `INSERT INTO public.m8_product_stock SELECT $1,p.product_id,p.establishment_id,p.establishment_name,p.stock,p.available,p.average_cost,p.establishment_price,$3,p.payload FROM jsonb_to_recordset($2::jsonb) AS p(product_id bigint,establishment_id bigint,establishment_name text,stock numeric,available numeric,average_cost numeric,establishment_price numeric,payload jsonb)`,
      [company, JSON.stringify(rows), at],
    );
    const newer = await db.query(
      'SELECT DISTINCT product_id::text FROM public.m8_product_available WHERE company_id=$1 AND product_id=ANY($2::bigint[]) AND collected_at>$3',
      [company, ids, at],
    );
    const eligible = ids.filter(
      (product) => !newer.rows.some((row) => row.product_id === product),
    );
    await db.query(
      'DELETE FROM public.m8_product_available WHERE company_id=$1 AND product_id=ANY($2::bigint[])',
      [company, eligible],
    );
    await db.query(
      `INSERT INTO public.m8_product_available SELECT $1,p.product_id,p.establishment_id,p.available,$3 FROM jsonb_to_recordset($2::jsonb) AS p(product_id bigint,establishment_id bigint,available numeric)`,
      [
        company,
        JSON.stringify(rows.filter((row) => eligible.includes(row.product_id))),
        at,
      ],
    );
    await db.query(
      'UPDATE public.m8_product_stock_queue SET success_at=now() WHERE company_id=$1 AND product_id=ANY($2::bigint[])',
      [company, ids],
    );
  });
  return { processed: groups.length, failures };
}
export async function syncProducts(
  client: Pick<M8Client, 'get' | 'getMany' | 'company' | 'timeZone'>,
  db: Database,
  mode: ProductMode,
  options: { maxProducts?: number; shouldStop?: () => boolean } = {},
) {
  const company = client.company,
    stopped = options.shouldStop || (() => false);
  const lock = { catalog: 81011, available: 81012, detail: 81013 }[mode];
  const locked = await db.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1::int,$2::int) AS locked',
    [lock, company],
  );
  if (!locked.rows[0]?.locked) return { processed: 0, failures: 0 };
  let processed = 0,
    failures = 0,
    missing = 0;
  try {
    if (mode === 'catalog') {
      const end = new Date();
      if (stopped())
        throw new SafeError('Coleta interrompida; checkpoint preservado');
      const collected = new Map<string, Record<string, unknown>>();
      // Use the API's unpaginated collection, verified against scoped ID queries.
      // The HTTP client enforces M8_MAX_RESPONSE_MB; never silently truncate a catalog.
      mergeCatalog(
        collected,
        listData(
          await client.get('/v1/estoque/produto', { Page: 0, PageSize: 0 }),
        ),
      );
      const all = [...collected.values()];
      for (let offset = 0; offset < all.length; offset += 500) {
        if (stopped())
          throw new SafeError('Coleta interrompida; checkpoint preservado');
        const rows = all.slice(offset, offset + 500);
        const normalized = rows.map((row) => {
          const product = id(row.id);
          return {
            product_id: product,
            name: row.nome ?? null,
            unit: row.unidadeNome ?? null,
            sale_price: numberOrNull(row.precoVenda),
            minimum_price: numberOrNull(row.precoVendaMinimo),
            source_updated_at:
              typeof row.dataAtualizacao === 'string'
                ? m8Timestamp(row.dataAtualizacao, client.timeZone)
                : null,
            payload: row,
          };
        });
        await transaction(db, async () => {
          const data = JSON.stringify(normalized);
          await db.query(
            `INSERT INTO public.m8_product_prices SELECT $1,p.product_id,$3,p.sale_price,p.minimum_price
            FROM jsonb_to_recordset($2::jsonb) AS p(product_id bigint,sale_price numeric,minimum_price numeric)
            LEFT JOIN public.m8_product_catalog c ON c.company_id=$1 AND c.product_id=p.product_id
            WHERE c.product_id IS NULL OR c.sale_price IS DISTINCT FROM p.sale_price OR c.minimum_price IS DISTINCT FROM p.minimum_price`,
            [company, data, end.toISOString()],
          );
          await db.query(
            `INSERT INTO public.m8_product_catalog SELECT $1,p.product_id,p.name,p.unit,p.sale_price,p.minimum_price,p.source_updated_at,$3,p.payload
            FROM jsonb_to_recordset($2::jsonb) AS p(product_id bigint,name text,unit text,sale_price numeric,minimum_price numeric,source_updated_at timestamptz,payload jsonb)
            ON CONFLICT(company_id,product_id) DO UPDATE SET name=EXCLUDED.name,unit=EXCLUDED.unit,sale_price=EXCLUDED.sale_price,minimum_price=EXCLUDED.minimum_price,source_updated_at=EXCLUDED.source_updated_at,collected_at=EXCLUDED.collected_at,payload=EXCLUDED.payload`,
            [company, data, end.toISOString()],
          );
          await db.query(
            `INSERT INTO public.m8_product_stock_queue(company_id,product_id) SELECT $1,p.product_id FROM jsonb_to_recordset($2::jsonb) AS p(product_id bigint) ON CONFLICT DO NOTHING`,
            [company, data],
          );
        });
        processed += normalized.length;
      }
      await db.query(
        `INSERT INTO public.m8_product_sync(company_id,mode,cursor_at,full_at,success_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(company_id,mode) DO UPDATE SET cursor_at=EXCLUDED.cursor_at,full_at=COALESCE(EXCLUDED.full_at,m8_product_sync.full_at),success_at=now()`,
        [company, mode, end.toISOString(), end.toISOString()],
      );
    } else {
      // Repair older catalogs without queue rows so every attempt advances fairly.
      if (mode === 'detail') await db.query(
        `INSERT INTO public.m8_product_stock_queue(company_id,product_id)
         SELECT company_id,product_id FROM public.m8_product_catalog WHERE company_id=$1
         ON CONFLICT DO NOTHING`, [company],
      );
      const result = await db.query(
        `SELECT c.product_id::text FROM public.m8_product_catalog c LEFT JOIN public.m8_product_stock_queue q USING(company_id,product_id)
        WHERE c.company_id=$1 ${mode === 'detail' ? "AND (q.success_at IS NULL OR q.success_at < now()-interval '1 hour')" : ''} ORDER BY ${mode === 'detail' ? 'q.attempted_at NULLS FIRST,' : '(SELECT min(a.collected_at) FROM public.m8_product_available a WHERE a.company_id=c.company_id AND a.product_id=c.product_id) NULLS FIRST,'}
        EXISTS(SELECT 1 FROM public.m8_os_produtos p WHERE p.company_id=c.company_id AND p.produto_id=c.product_id) DESC,c.product_id LIMIT $2`,
        [
          company,
          options.maxProducts ?? (mode === 'detail' ? 1000 : 2147483647),
        ],
      );
      const ids = result.rows.map((row) => String(row.product_id));
      const batch = mode === 'available' ? 50 : 10;
      for (let offset = 0; offset < ids.length; offset += batch) {
        if (stopped()) break;
        const requested = ids.slice(offset, offset + batch),
          at = new Date().toISOString();
        try {
          if (mode === 'available') {
            const body = await client.getMany(
              '/v1/estoque/estoquedisponivelestabelecimento',
              {
                EmpresaId: company,
                ProdutosIds: requested,
                Page: 0,
                PageSize: 0,
              },
            );
            const rows = listData(body),
              present = requested.filter((product) =>
                rows.some((row) => id(row.produtoId) === product),
              );
            // Validate unexpected IDs before committing even a partial batch.
            if (rows.some((row) => !requested.includes(id(row.produtoId))))
              throw new SafeError('Estoque retornou produto não solicitado');
            if (present.length)
              await saveAvailability(db, company, present, body, at);
            if (present.length !== requested.length) {
              missing += requested.length - present.length;
              log(
                'PRODUTOS',
                'Produtos sem retorno de disponível; saldos anteriores preservados',
                { company, missing: requested.length - present.length },
              );
            }
            processed += present.length;
          } else {
            const result = await collectDetailBatch(client, db, requested, at);
            processed += result.processed;
            failures += result.failures;
          }
        } catch (error) {
          failures++;
          log('PRODUTOS', safeError(error), { company, mode });
        }
      }
      if (!failures && !missing && !stopped())
        await db.query(
          `INSERT INTO public.m8_product_sync(company_id,mode,success_at) VALUES($1,$2,now()) ON CONFLICT(company_id,mode) DO UPDATE SET success_at=now()`,
          [company, mode],
        );
    }
    log('PRODUTOS', 'Coleta encerrada', {
      company,
      mode,
      processed,
      failures,
      missing,
    });
    return { processed, failures, missing };
  } finally {
    await db.query('SELECT pg_advisory_unlock($1::int,$2::int)', [
      lock,
      company,
    ]);
  }
}
