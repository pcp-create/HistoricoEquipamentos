import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import type { Database } from '../src/database/postgres.js';
import { IntegrationRepository } from '../src/database/integracaoLog.repository.js';
import { scanIds } from '../src/sync/idScan.js';
const db = new PGlite();
const adapter: Database = { async query<T extends pg.QueryResultRow>(sql: string, args?: unknown[]) { return db.query<T>(sql, args); } };
const repo = new IntegrationRepository(adapter);
before(async () => {
  for (const name of ['001_m8_history.sql','002_m8_observed_types.sql','003_m8_id_scan.sql', '004_m8_approval_mixed.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
});
beforeEach(async () => { await db.exec('TRUNCATE m8_ordens_servico,integracao_m8_id_scan,integracao_m8_checkpoint,integracao_m8_log CASCADE'); });
after(async () => { await db.close(); });
const base = { company: 1, timeZone: 'America/Sao_Paulo' };
test('gaps do not terminate scanning and limited runs resume with original watermark', async () => {
  const calls: number[] = [];
  const client = { ...base, get: async (_: string, params: Record<string, string | number | boolean>) => {
    calls.push(Number(params.Id));
    return { data: params.Id === '3' ? [{ id: 3 }] : [] };
  } };
  await scanIds(client, repo, { fromId: 1, toId: 4, maxIds: 2 });
  assert.equal(await repo.checkpoint(1), null);
  const start = (await db.query<{ started_at: Date }>('SELECT started_at FROM integracao_m8_id_scan')).rows[0]!.started_at;
  await scanIds(client, repo, { fromId: 1, toId: 4 });
  assert.deepEqual(calls, [1,2,3,4]);
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length, 1);
  assert.equal((await repo.checkpoint(1))?.getTime(), new Date(start).getTime());
  await scanIds(client, repo, { fromId: 1, toId: 4 });
  assert.equal(calls.length, 4);
});
test('failed ID is retried and baseline never advances after failure', async () => {
  let fail = true;
  const calls: number[] = [];
  const client = { ...base, get: async (_: string, params: Record<string, string | number | boolean>) => {
    const n = Number(params.Id); calls.push(n);
    if (n === 2 && fail) throw new Error('temporary');
    return { data: [{ id: n }] };
  } };
  await assert.rejects(scanIds(client, repo, { fromId: 1, toId: 3 }));
  assert.equal(await repo.checkpoint(1), null);
  fail = false;
  await scanIds(client, repo, { fromId: 1, toId: 3 });
  assert.deepEqual(calls, [1,2,2,3]);
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length, 3);
});
test('unexpected ID fails closed and arbitrary subranges never establish baseline', async () => {
  await assert.rejects(scanIds({ ...base, get: async () => ({ data: [{ id: 99 }] }) }, repo, { fromId: 1, toId: 3 }), /Filtro Id/);
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length, 0);
  await scanIds({ ...base, get: async () => ({ data: [] }) }, repo, { fromId: 2, toId: 3 });
  assert.equal(await repo.checkpoint(1), null);
});
