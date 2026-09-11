import { pathToFileURL } from 'node:url';
import { m8Config } from '../config/env.js';
import { M8Client } from '../m8/client.js';
import { fetchOrders, parseOrders, ORDERS_ENDPOINT, id } from '../m8/ordemServico.js';
import { schemas } from '../database/schema.js';
import { mapEntity } from '../database/ordensServico.repository.js';
import { record } from '../m8/ordemServico.js';
import { log, SafeError, safeError } from '../utils/logger.js';

export async function testCommunication(client: M8Client, pagination = false) {
  const rows = await fetchOrders(client, 1, 1);
  // Validate known fields without printing any customer data or response payload.
  for (const order of rows) {
    for (const schema of schemas) {
      const value = schema.collection === null ? order : order[schema.collection];
      if (value == null) continue;
      const values = schema.collection === null || schema.collection === 'equipamentoProduto' ? [value] : value;
      if (!Array.isArray(values)) throw new SafeError(`Formato inesperado: ${schema.collection}`);
      for (const row of values) {
        if (!record(row)) throw new SafeError(`Objeto inválido: ${schema.table}`);
        if (schema.collection === 'equipamentoProduto' && Object.keys(row).length === 0) continue;
        mapEntity(schema, row, client.company, schema.collection === null ? undefined : id(order.id), client.timeZone);
      }
    }
  }
  log('M8', 'Comunicação validada: HTTP 200', { company: client.company, registros: rows.length });
  if (pagination) await testPagination(client);
}
export async function testPagination(client: Pick<M8Client, 'get' | 'company'>) {
  // Compare equivalent sets under two page sizes: catches empty page 2 despite more data.
  const reference = await fetchOrders(client, 1, 10);
  const first = await fetchOrders(client, 1, 5);
  const second = await fetchOrders(client, 2, 5);
  log('M8', 'Comparação de paginação', { company: client.company, referencia10: reference.length, pagina1de5: first.length, pagina2de5: second.length });
  if (reference.length <= 5) throw new SafeError('Amostra insuficiente para validar paginação; verificar manualmente antes de habilitar carga');
  const combined = [...first, ...second].map(row => id(row.id));
  const expected = new Set(reference.map(row => id(row.id)));
  if (first.length !== 5 || combined.length !== expected.size || new Set(combined).size !== combined.length || combined.some(key => !expected.has(key))) {
    throw new SafeError('Paginação inconsistente: duas páginas de 5 não reproduzem a primeira página de 10; não interpretar página vazia como fim da base');
  }
  const firstIds = new Set(first.map(row => id(row.id)));
  // Probe page zero only in this explicit validation command, never during synchronization.
  try {
    const zero = parseOrders(await client.get(ORDERS_ENDPOINT, { Page: 0, PageSize: 5 }));
    if (zero.length !== first.length || zero.some(row => !firstIds.has(id(row.id)))) {
      throw new SafeError('Page=0 difere de Page=1; origem da paginação inconclusiva. Validar contrato antes de sincronizar');
    }
  } catch (error) {
    if (!(error instanceof SafeError && error.status === 400)) throw error;
  }
  log('M8', 'Paginação validada na amostra: duas páginas de 5 equivalem à primeira de 10', { company: client.company });
}

async function main() {
  let config;
  try { config = m8Config(); } catch (error) {
    // Config errors are locally authored and contain variable names only.
    log('CONFIG', error instanceof Error && !(error instanceof TypeError) ? error.message : 'Configuração inválida');
    process.exitCode = 1; return;
  }
  for (const company of config.companies) {
    try { await testCommunication(new M8Client(config, company), process.argv.includes('--pagination')); }
    catch (error) { log('M8', safeError(error), { company }); process.exitCode = 1; }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
