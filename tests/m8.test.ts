import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m8Config } from '../src/config/env.js';
import { M8Auth } from '../src/m8/auth.js';
import { M8Client } from '../src/m8/client.js';
import { parseOrders } from '../src/m8/ordemServico.js';
import { requestWithRetry, retryDelay, type Transport } from '../src/utils/retry.js';
import { monthWindows, parseDate } from '../src/utils/dates.js';
import { syncSettings } from '../src/index.js';
const env = { M8_TENANT: 'test', M8_USERNAME: 'test', M8_PASSWORD: 'test-only', M8_TOKEN_PATH: 'data.token' };
const config = m8Config(env);
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const noWait = async () => {};

test('three companies by default, legacy alias and explicit list precedence', () => {
  assert.deepEqual(config.companies, [1, 2, 27404]);
  assert.deepEqual(m8Config({ ...env, M8_COMPANY: '2' }).companies, [2]);
  assert.deepEqual(m8Config({ ...env, M8_COMPANY: '1', M8_COMPANIES: '1,2,27404,1' }).companies, [1, 2, 27404]);
  assert.throws(() => m8Config({ ...env, M8_COMPANIES: '1,,2' }));
  assert.throws(() => m8Config({ ...env, M8_COMPANIES: '1.1' }));
  assert.throws(() => m8Config({ ...env, M8_API_URL: 'http://example.com' }));
  assert.throws(() => m8Config({ ...env, M8_API_URL: 'https://example.com/v1' }));
  assert.throws(() => m8Config({ ...env, M8_API_URL: 'https://a.test', M8_BASE_URL: 'https://b.test' }));
});
test('authentication deduplicates concurrency, renews at five minutes and isolates companies', async () => {
  let now = 0;
  const calls: number[] = [];
  const transport: Transport = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { company: number };
    calls.push(body.company);
    return response({ data: { token: `opaque-${body.company}-${calls.length}` } });
  };
  const a = new M8Auth(config, 1, transport, () => now, noWait);
  const b = new M8Auth(config, 2, transport, () => now, noWait);
  const tokens = await Promise.all(Array.from({ length: 20 }, () => a.getToken()));
  assert.equal(new Set(tokens).size, 1);
  assert.deepEqual(calls, [1]);
  assert.notEqual(await b.getToken(), tokens[0]);
  now = 299999;
  assert.equal(await a.getToken(), tokens[0]);
  now = 300000;
  const renewed = await a.getToken();
  assert.notEqual(renewed, tokens[0]);
  a.invalidate(tokens[0]!);
  assert.equal(await a.getToken(), renewed);
  assert.deepEqual(calls, [1, 2, 1]);
});
test('401 retries exactly the same page and parameters with a new Bearer token', async () => {
  let auths = 0;
  const gets: { url: string; token: string }[] = [];
  const transport: Transport = async (url, init) => {
    if (String(url).endsWith('/auth/token')) return response({ data: { token: `token-${++auths}` } });
    gets.push({ url: String(url), token: new Headers(init?.headers).get('Authorization')! });
    return response({ data: [{ id: 37 }], errors: [] }, gets.length === 1 ? 401 : 200);
  };
  const client = new M8Client(config, 27404, transport, noWait);
  await client.get('/v1/assistenciatecnica/ordemservicocompleta', { Page: 37, PageSize: 500, DataAtualizacaoFinal: '2026-09-10T10:00:00Z' });
  assert.equal(auths, 2);
  assert.equal(gets[0]?.url, gets[1]?.url);
  assert.deepEqual(gets.map(r => r.token), ['Bearer token-1', 'Bearer token-2']);
});
test('persistent 401 is bounded; failed auth promise may be retried later', async () => {
  let auths = 0;
  const transport: Transport = async url => {
    if (String(url).endsWith('/auth/token')) return response({ data: { token: `token-${++auths}` } });
    return response({}, 401);
  };
  await assert.rejects(new M8Client(config, 1, transport, noWait).get('/v1/test', {}), /401/);
  assert.equal(auths, 2);
  let count = 0;
  const auth = new M8Auth(config, 1, async () => ++count === 1 ? response({}, 403) : response({ data: { token: 'success' } }), Date.now, noWait);
  await assert.rejects(auth.getToken());
  assert.equal(await auth.getToken(), 'success');
});
test('retry covers 429/500/502/503/timeouts with bounded attempts and Retry-After', async () => {
  for (const status of [429, 500, 502, 503]) {
    let count = 0;
    const waits: number[] = [];
    const result = await requestWithRetry('https://example.com/v1/test', {}, config,
      async () => ++count === 1 ? new Response('{}', { status, headers: { 'Retry-After': '2' } }) : response({}),
      async ms => { waits.push(ms); });
    assert.equal(result.status, 200); assert.deepEqual(waits, [2000]);
  }
  let count = 0;
  await assert.rejects(requestWithRetry('https://example.com/v1/test', {}, config,
    async () => { count++; throw new TypeError('connection error containing secret'); }, noWait), /tentativas esgotadas/);
  assert.equal(count, config.maxAttempts);
  assert.equal(retryDelay(0, 'Thu, 01 Jan 1970 00:00:02 GMT', 0), 2000);
  assert.throws(() => retryDelay(0, '9999999'), /Retry-After/);
});
test('unexpected API contract fails closed', () => {
  assert.throws(() => parseOrders({ items: [] }));
  assert.throws(() => parseOrders({ data: [], errors: ['secret backend error'] }));
  assert.throws(() => parseOrders({ data: [{ id: 1 }, { id: '01' }] }));
  assert.throws(() => parseOrders({ data: [{ id: 9007199254740992 }] }));
  assert.equal(parseOrders({ data: [] }).length, 0);
});
test('date windows overlap boundaries without gaps and keep fixed end', () => {
  const end = parseDate('2024-03-02');
  const windows = [...monthWindows(parseDate('2024-01-31'), end)];
  assert.equal(windows.length, 3);
  assert.equal(windows[0]?.to.toISOString(), '2024-02-01T00:00:00.000Z');
  assert.equal(windows[1]?.to.toISOString(), '2024-03-01T00:00:00.000Z');
  assert.equal(windows[2]?.to.getTime(), end.getTime());
  assert.equal(parseDate('2026-09-10', true).toISOString(), '2026-09-10T23:59:59.999Z');
  assert.throws(() => parseDate('2026-02-30'));
  assert.throws(() => parseDate('2026-09-10T10:00:00'));
  assert.throws(() => [...monthWindows(end, parseDate('2024-01-01'))]);
});
test('CLI protects full loads and validates reprocess arguments', () => {
  const now = new Date();
  assert.throws(() => syncSettings({}, ['INICIAL'], now), /PAGINATION_VALIDATED/);
  assert.throws(() => syncSettings({}, ['TESTE', '--from=2026-09-01'], now), /--from e --to/);
  const settings = syncSettings({}, ['TESTE', '--from=2026-09-01', '--to=2026-09-10'], now);
  assert.equal(settings.reprocess?.to.toISOString(), '2026-09-10T23:59:59.999Z');
  assert.equal(settings.end, now);
});
