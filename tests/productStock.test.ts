import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  mergeCatalog,
  stockRows,
  numberOrNull,
  saveAvailability,
  syncProducts,
} from '../src/sync/productStock.js';
import type { Database } from '../src/database/postgres.js';
import type pg from 'pg';
const db = new PGlite();
const adapter: Database = {
  async query<T extends pg.QueryResultRow>(sql: string, values?: unknown[]) {
    return db.query<T>(sql, values);
  },
};
before(async () => {
  await db.exec(
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE m8_os_produtos(company_id bigint,produto_id bigint);',
  );
  await db.exec(
    await readFile(
      new URL(
        '../supabase/migrations/006_m8_product_stock.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  // PGlite has a single session; advisory lock behavior is tested by server PostgreSQL.
  await db.exec(
    'CREATE FUNCTION pg_try_advisory_lock(int,int) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$; CREATE FUNCTION pg_advisory_unlock(int,int) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;',
  );
});
after(() => db.close());
test('only location variants merge; conflicting prices and invalid snapshots are rejected', () => {
  const m = new Map();
  mergeCatalog(m, [
    { id: 1, precoVenda: 10, localizacao: 'A' },
    { id: 1, precoVenda: 10, localizacao: 'B' },
  ]);
  assert.deepEqual(m.get('1').localizacoes, ['A', 'B']);
  assert.throws(() =>
    mergeCatalog(m, [{ id: 1, precoVenda: 20, localizacao: 'B' }]),
  );
  assert.throws(() =>
    stockRows(
      { data: [{ produtoId: 2, estabelecimentoId: 1, estoqueDisponivel: 1 }] },
      ['1'],
    ),
  );
  assert.throws(() => stockRows({ data: [] }, ['1']));
  assert.throws(() =>
    stockRows(
      {
        data: [
          { produtoId: 1, estabelecimentoId: 1 },
          { produtoId: 1, estabelecimentoId: 1 },
        ],
      },
      ['1'],
    ),
  );
  assert.throws(() => numberOrNull(Infinity));
  assert.equal(numberOrNull(null), null);
  assert.equal(numberOrNull(-5), -5);
});
test('snapshots preserve company isolation and last good values on incomplete or invalid responses', async () => {
  const at = '2026-09-11T12:00:00Z';
  await saveAvailability(
    adapter,
    1,
    ['1'],
    {
      data: [
        { produtoId: 1, estabelecimentoId: 10, estoqueDisponivel: 5 },
        { produtoId: 1, estabelecimentoId: 20, estoqueDisponivel: -1 },
      ],
    },
    at,
  );
  await saveAvailability(
    adapter,
    2,
    ['1'],
    { data: [{ produtoId: 1, estabelecimentoId: 10, estoqueDisponivel: 99 }] },
    at,
  );
  await assert.rejects(
    saveAvailability(
      adapter,
      1,
      ['1', '2'],
      { data: [{ produtoId: 1, estabelecimentoId: 10, estoqueDisponivel: 0 }] },
      at,
    ),
  );
  assert.equal(
    (
      await db.query<{v:string}>(
        'SELECT sum(available)::text AS v FROM m8_product_available WHERE company_id=1',
      )
    ).rows[0]?.v,
    '4',
  );
  assert.equal(
    (
      await db.query<{v:string}>(
        'SELECT available::text AS v FROM m8_product_available WHERE company_id=2',
      )
    ).rows[0]?.v,
    '99',
  );
  await saveAvailability(
    adapter,
    1,
    ['1'],
    { data: [{ produtoId: 1, estabelecimentoId: 10, estoqueDisponivel: 0 }] },
    at,
  );
  assert.equal(
    (await db.query('SELECT * FROM m8_product_available WHERE company_id=1'))
      .rows.length,
    1,
  );
});
test('catalog checkpoints, observed price history and stock detail work without modifying OS', async () => {
  let price = 10,
    broken = false;
  const client = {
    company: 1,
    timeZone: 'America/Sao_Paulo',
    get: async (path: string) => {
      if (broken) throw new Error('failure');
      return path.endsWith('/estoque')
        ? {
            data: [
              {
                produtoId: 1,
                estabelecimentoId: 10,
                estoque: 3,
                estoqueDisponivel: 2,
                valorCustoMedioAtual: 4,
                valorVendaEstabelecimento: price,
              },
            ],
          }
        : {
            data: [
              {
                id: 1,
                nome: 'Filtro',
                unidadeNome: 'UN',
                precoVenda: price,
                precoVendaMinimo: 8,
                dataAtualizacao: '2026-09-11T09:00:00',
              },
            ],
          };
    },
    getMany: async () => ({ data: [] }),
  };
  await syncProducts(client, adapter, 'catalog');
  await syncProducts(client, adapter, 'catalog');
  assert.equal(
    (await db.query('SELECT * FROM m8_product_prices')).rows.length,
    1,
  );
  price = 12;
  await syncProducts(client, adapter, 'catalog');
  assert.equal(
    (await db.query('SELECT * FROM m8_product_prices')).rows.length,
    2,
  );
  const previous = (
    await db.query(
      "SELECT cursor_at::text FROM m8_product_sync WHERE mode='catalog'",
    )
  ).rows[0];
  broken = true;
  await assert.rejects(syncProducts(client, adapter, 'catalog'));
  broken = false;
  assert.deepEqual(
    (
      await db.query(
        "SELECT cursor_at::text FROM m8_product_sync WHERE mode='catalog'",
      )
    ).rows[0],
    previous,
  );
  await db.exec('INSERT INTO m8_os_produtos VALUES(1,1)');
  await syncProducts(client, adapter, 'detail');
  const current = (
    await db.query(
      'SELECT stock::text,stock_value::text FROM m8_product_current WHERE company_id=1',
    )
  ).rows[0];
  assert.deepEqual(current, { stock: '3', stock_value: '12' });
  assert.equal((await db.query('SELECT * FROM m8_os_produtos')).rows.length, 1);
});
test('older available snapshots cannot overwrite newer detail or batch values', async () => {
  await saveAvailability(
    adapter,
    1,
    ['1'],
    { data: [{ produtoId: 1, estabelecimentoId: 10, estoqueDisponivel: 8 }] },
    '2099-01-01T00:00:00Z',
  );
  await saveAvailability(
    adapter,
    1,
    ['1'],
    { data: [{ produtoId: 1, estabelecimentoId: 10, estoqueDisponivel: 2 }] },
    '2026-01-01T00:00:00Z',
  );
  assert.equal(
    (
      await db.query<{v:string}>(
        'SELECT available::text AS v FROM m8_product_available WHERE company_id=1',
      )
    ).rows[0]?.v,
    '8',
  );
});
test('M8 batch queries encode each product ID separately', async () => {
  const { M8Client } = await import('../src/m8/client.js');
  const { m8Config } = await import('../src/config/env.js');
  const config = m8Config({
    M8_TENANT: 'test',
    M8_USERNAME: 'test',
    M8_PASSWORD: 'test',
    M8_COMPANIES: '1',
  });
  let checked = false;
  const client = new M8Client(config, 1, async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/token'))
      return new Response(
        JSON.stringify({ data: { token: 'opaque-test-token' } }),
      );
    assert.deepEqual(u.searchParams.getAll('ProdutosIds'), ['1', '2']);
    checked = true;
    return new Response(JSON.stringify({ data: [] }));
  });
  await client.getMany('/v1/estoque/estoquedisponivelestabelecimento', {
    EmpresaId: 1,
    ProdutosIds: ['1', '2'],
  });
  assert.equal(checked, true);
});
test('detail batches limit concurrency and preserve failed products while committing successful siblings',async()=>{
 await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,collected_at,payload) SELECT 1,id,now(),'{}'::jsonb FROM generate_series(2,4) id;
 INSERT INTO m8_product_stock_queue(company_id,product_id) SELECT 1,id FROM generate_series(2,4) id;
 INSERT INTO m8_os_produtos SELECT 1,id FROM generate_series(2,4) id;
 INSERT INTO m8_product_stock(company_id,product_id,establishment_id,stock,collected_at,payload) VALUES(1,3,10,99,now(),'{}');`);
 let active=0,peak=0;
 const client={company:1,timeZone:'America/Sao_Paulo',getMany:async()=>({data:[]}),get:async(path:string)=>{
  active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,5));active--;
  const product=Number(path.split('/').at(-2));if(product===3)throw new Error('unavailable');
  return {data:[{produtoId:product,estabelecimentoId:10,estoque:5,estoqueDisponivel:4,valorCustoMedioAtual:2}]};
 }};
 const result=await syncProducts(client,adapter,'detail');
 assert.equal(result.processed,2);assert.equal(result.failures,1);assert.equal(peak,2);
 assert.equal((await db.query<{stock:string}>('SELECT stock::text FROM m8_product_stock WHERE company_id=1 AND product_id=3')).rows[0]?.stock,'99');
 assert.equal((await db.query('SELECT * FROM m8_product_stock WHERE company_id=1 AND product_id IN (2,4)')).rows.length,2);
});
