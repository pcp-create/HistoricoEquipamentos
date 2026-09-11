import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { persistPage } from '../src/database/ordensServico.repository.js';
import { IntegrationRepository } from '../src/database/integracaoLog.repository.js';
import type { Database } from '../src/database/postgres.js';
import { syncCompany, type SyncOptions } from '../src/sync/syncOrdensServico.js';
import type { M8OrdemServicoCompleta } from '../src/m8/types.js';
const db = new PGlite();
const adapter: Database = {
  async query<T extends pg.QueryResultRow>(text: string, values?: unknown[]) {
    const result = await db.query<T>(text, values); return { rows: result.rows, rowCount: result.affectedRows };
  },
};
const repo = new IntegrationRepository(adapter);
const from = new Date('2026-09-01T00:00:00Z'), to = new Date('2026-09-10T10:00:00Z');
const options: SyncOptions = { company: 1, mode: 'INICIAL', end: to, initialStart: from, pageSize: 2, months: 1, overlapMinutes: 10, initialField: 'atualizacao' };
before(async () => {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for (const name of ['001_m8_history.sql', '002_m8_observed_types.sql', '003_m8_id_scan.sql', '004_m8_approval_mixed.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
});
beforeEach(async () => { await db.exec('TRUNCATE m8_ordens_servico, integracao_m8_log, integracao_m8_checkpoint CASCADE'); });
after(async () => { await db.close(); });
const sample: M8OrdemServicoCompleta = {
  id: 10, numeroSequencia: 42, clienteNome: 'Cliente teste', numeroSerie: 'SERIE-TESTE',
  produtos: [{ id: 1, produtoId: 50, produtoNome: 'Filtro', quantidade: '1.25', valorTotal: '10.50', estaExcluido: false }, { id: 2, estaExcluido: true }],
  apontamentos: [{ id: 3, totalHoras: '125:30:00' }], equipamentoProduto: { id: 4, numeroSerie: 'SERIE-TESTE' },
  manutencao: { originalDesconhecido: 'preservado' },
};
test('migration, relational upserts, company isolation, child preservation and operational views', async () => {
  const logId = await repo.start(1, 'TESTE', { from, to });
  const first = await persistPage(adapter, 1, [sample], logId, 1);
  assert.equal(first.inserted, 1);
  const second = await persistPage(adapter, 1, [{ ...sample, produtos: [{ id: 1, quantidade: '2.50' }] }], logId, 1);
  assert.equal(second.updated, 1);
  await persistPage(adapter, 2, [sample], await repo.start(2, 'TESTE', { from, to }), 1);
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length, 2);
  assert.equal((await db.query('SELECT * FROM m8_os_produtos')).rows.length, 4);
  const material = await db.query<{ quantidade: string; produto_nome: string }>('SELECT quantidade,produto_nome FROM m8_os_produtos WHERE company_id=1 AND id_m8=1');
  assert.equal(material.rows[0]?.quantidade, '2.50'); assert.equal(material.rows[0]?.produto_nome, 'Filtro');
  assert.equal((await db.query<{ total_horas: string }>('SELECT total_horas FROM m8_os_apontamentos LIMIT 1')).rows[0]?.total_horas, '125:30:00');
  for (const view of ['vw_os_materiais', 'vw_historico_equipamentos', 'vw_historico_materiais']) {
    assert.equal((await db.query(`SELECT * FROM ${view}`)).rows.length, 2);
  }
  assert.equal((await db.query('SELECT * FROM m8_os_manutencao')).rows.length, 2);
});
test('invalid child rolls back all orders, children and page counters', async () => {
  const logId = await repo.start(1, 'TESTE', { from, to });
  await assert.rejects(persistPage(adapter, 1, [sample, { id: 11, produtos: [{ id: 7, quantidade: 'invalid' }] }], logId, 1));
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length, 0);
  assert.equal((await db.query<{ paginas_processadas: number }>('SELECT paginas_processadas FROM integracao_m8_log')).rows[0]?.paginas_processadas, 0);
});
test('duplicate child IDs fail rather than silently overwrite', async () => {
  const logId = await repo.start(1, 'TESTE', { from, to });
  await assert.rejects(persistPage(adapter, 1, [{ id: 10, produtos: [{ id: 1 }, { id: 1 }] }], logId, 1), /duplicado/);
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length, 0);
});
test('successful load advances only that company; incremental overlaps ten minutes and fixes end', async () => {
  await syncCompany({ get: async () => ({ data: [sample] }) }, repo, options);
  assert.equal((await repo.checkpoint(1))?.toISOString(), to.toISOString());
  assert.equal(await repo.checkpoint(2), null);
  const requests: Record<string, string | number | boolean>[] = [];
  const nextEnd = new Date('2026-09-10T11:00:00Z');
  await syncCompany({ get: async (_path, params) => { requests.push(params); return { data: [] }; } }, repo, { ...options, mode: 'INCREMENTAL', end: nextEnd });
  assert.equal(requests[0]?.DataAtualizacaoInicial, '2026-09-10T09:50:00.000Z');
  assert.equal(requests[0]?.DataAtualizacaoFinal, nextEnd.toISOString());
  assert.equal((await repo.checkpoint(1))?.toISOString(), nextEnd.toISOString());
});
test('failure on page two retains committed page one but never advances checkpoint', async () => {
  let calls = 0;
  await assert.rejects(syncCompany({ get: async () => {
    if (++calls === 2) throw new Error('secret upstream error');
    return { data: [{ id: 1 }, { id: 2 }] };
  } }, repo, options));
  assert.equal(await repo.checkpoint(1), null);
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length, 2);
  const result = await db.query<{ status: string; erro: string }>('SELECT status,erro FROM integracao_m8_log');
  assert.equal(result.rows[0]?.status, 'ERRO'); assert.ok(!result.rows[0]?.erro.includes('secret'));
});
test('limited run and reprocessing never advance checkpoint; repeated pages fail', async () => {
  await syncCompany({ get: async () => ({ data: [{ id: 1 }, { id: 2 }] }) }, repo, { ...options, maxPages: 1 });
  assert.equal(await repo.checkpoint(1), null);
  assert.equal((await db.query<{ status: string }>('SELECT status FROM integracao_m8_log')).rows[0]?.status, 'LIMITADO');
  await syncCompany({ get: async () => ({ data: [] }) }, repo, { ...options, mode: 'REPROCESSAMENTO', reprocess: { from, to } });
  assert.equal(await repo.checkpoint(1), null);
  await assert.rejects(syncCompany({ get: async () => ({ data: [{ id: 1 }, { id: 2 }] }) }, repo, options), /Paginação repetiu/);
  assert.equal(await repo.checkpoint(1), null);
});
test('incremental requires a completed initial baseline and lock contention prevents writes', async () => {
  await assert.rejects(syncCompany({ get: async () => ({ data: [] }) }, repo, { ...options, mode: 'INCREMENTAL' }), /sem carga inicial/);
  const lockedDb: Database = { query: async () => ({ rows: [{ locked: false }] as never[] }) };
  await assert.rejects(new IntegrationRepository(lockedDb).lock(1), /execução ativa/);
});
test('anonymous role cannot read customer tables or views', async () => {
  await db.exec('SET ROLE anon');
  try {
    await assert.rejects(db.query('SELECT * FROM m8_ordens_servico'), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM vw_historico_equipamentos'), /permission denied/);
  } finally { await db.exec('RESET ROLE'); }
});

test('observed M8 scalar types and Brazilian local timestamps persist without enum guessing', async () => {
  const logId = await repo.start(1, 'TESTE', { from, to });
  await persistPage(adapter, 1, [{ id: 99, statusAprovacao: 2, dataAbertura: '2026-09-10T10:15:00',
    produtos: [{ id: 1, tipoContrato: 3, faturado: '1.25', aprovado: 'Estado recebido' }],
  }], logId, 1, 'America/Sao_Paulo');
  const order = await db.query<{ status_aprovacao: number; utc: string }>("SELECT status_aprovacao, to_char(data_abertura AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS utc FROM m8_ordens_servico");
  assert.equal(String(order.rows[0]?.status_aprovacao), '2');
  assert.equal(order.rows[0]?.utc, '2026-09-10 13:15:00');
  await persistPage(adapter, 1, [{ id: 99, statusAprovacao: 'Aguardando' }], logId, 2);
  assert.equal((await db.query<{ status_aprovacao: string }>('SELECT status_aprovacao FROM m8_ordens_servico')).rows[0]?.status_aprovacao, 'Aguardando');
  const product = await db.query<{ tipo_contrato: number; faturado: string; aprovado: string }>('SELECT tipo_contrato,faturado,aprovado FROM m8_os_produtos');
  assert.equal(String(product.rows[0]?.tipo_contrato), '3');
  assert.equal(product.rows[0]?.faturado, '1.25');
  assert.equal(product.rows[0]?.aprovado, 'Estado recebido');
});
