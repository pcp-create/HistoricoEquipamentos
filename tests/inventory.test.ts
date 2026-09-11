import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchInventory, parseInventory, SUMMARY_ENDPOINT } from '../src/m8/inventory.js';
test('inventory uses only summary endpoint unpaginated and retains no customer data', async () => {
  const result = await fetchInventory({ get: async (path, params) => {
    assert.equal(path, SUMMARY_ENDPOINT); assert.deepEqual(params, { Page: 0, PageSize: 0 });
    return { data: [{ id: 14681, status: 'Processado', clienteNome: 'not retained' }], errors: [] };
  } });
  assert.deepEqual(result, [{ id: '14681', status: 'Processado', occurrences: 1 }]);
});
test('inventory rejects nested payloads and unknown status', async () => {
  for (const data of [[{ id: 1, status: 'Processado', produtos: [] }], [{ id: 1, status: 9 }]]) {
    await assert.rejects(fetchInventory({ get: async () => ({ data }) }));
  }
});

test('summary deduplicates IDs without losing status contradictions', () => {
  const data = [
    { id: 1, status: 'Processado' }, { id: 1, status: 'Processado' },
    { id: 2, status: 'Pendente' }, { id: 2, status: 'Processado' }, { id: 2, status: 'Processado' },
  ];
  assert.deepEqual(parseInventory({ data }), [
    { id: '1', status: 'Processado', occurrences: 2 },
    { id: '2', status: null, occurrences: 3 },
  ]);
});
