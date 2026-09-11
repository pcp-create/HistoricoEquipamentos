import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m8Timestamp, validateTimeZone } from '../src/utils/m8Dates.js';
import { testPagination } from '../src/scripts/testM8.js';

test('M8 local Brasília time converts to UTC with historical daylight saving rules', () => {
  assert.equal(m8Timestamp('2026-09-10T10:15:00'), '2026-09-10T13:15:00Z');
  assert.equal(m8Timestamp('2018-01-15T10:15:00'), '2018-01-15T12:15:00Z');
  assert.equal(m8Timestamp('2018-07-15T10:15:00'), '2018-07-15T13:15:00Z');
  assert.equal(m8Timestamp('2026-09-10T10:15:00.123456'), '2026-09-10T13:15:00.123456Z');
  assert.equal(m8Timestamp('2026-09-10'), '2026-09-10T03:00:00Z');
});
test('explicit offsets preserve the instant and configured Brazilian zones are honored', () => {
  assert.equal(m8Timestamp('2026-09-10T10:15:00Z'), '2026-09-10T10:15:00Z');
  assert.equal(m8Timestamp('2026-09-10T10:15:00-04:00'), '2026-09-10T14:15:00Z');
  assert.equal(m8Timestamp('2026-09-10T10:15:00', 'America/Manaus'), '2026-09-10T14:15:00Z');
  assert.throws(() => validateTimeZone('Brazil/nonexistent'));
});
test('invalid, ambiguous and nonexistent local dates fail without silent normalization', () => {
  for (const value of ['2026-02-30T10:00:00', '2018-11-04T00:30:00', '2019-02-16T23:30:00', 'invalid']) {
    assert.throws(() => m8Timestamp(value));
  }
});
test('pagination detects observed empty page two despite ten available orders', async () => {
  await assert.rejects(testPagination({ company: 1, get: async (_path, params) => ({
    data: params.Page === 2 ? [] : Array.from({ length: Number(params.PageSize) }, (_, i) => ({ id: i + 1 })),
  }) }), /Paginação inconsistente/);
});
test('consistent pagination matches two pages of five against one of ten', async () => {
  const calls: Record<string, string | number | boolean>[] = [];
  await testPagination({ company: 1, get: async (_path, params) => {
    calls.push(params);
    const start = Math.max(0, Number(params.Page) - 1) * Number(params.PageSize);
    return { data: Array.from({ length: Number(params.PageSize) }, (_, i) => ({ id: start + i + 1 })) };
  } });
  assert.ok(calls.every(params => Number(params.PageSize) > 0));
});
