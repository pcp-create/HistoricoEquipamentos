import type { M8Client } from '../m8/client.js';
import { SUMMARY_ENDPOINT } from '../m8/inventory.js';
import { summaryHeaders, fetchHeader, fetchCollection, collectionNames, type Children } from '../m8/collections.js';
import { IntegrationRepository } from '../database/integracaoLog.repository.js';
import { CycleRepository } from '../database/cycle.repository.js';
import { log, safeError } from '../utils/logger.js';
export interface CycleOptions { maxOrders?: number; shouldStop?: () => boolean; resumeOnly?: boolean }
export async function collectionCycle(client: Pick<M8Client,'company'|'get'|'timeZone'>, integration: IntegrationRepository, options: CycleOptions = {}) {
  const company = client.company;
  await integration.lock(company);
  let logId: string | undefined;
  const repo = new CycleRepository(integration.db, company, client.timeZone);
  try {
    const startedAt = new Date();
    logId = await integration.start(company, 'INCREMENTAL', { from: startedAt, to: startedAt });
    await integration.db.query("UPDATE public.integracao_m8_log SET processo='CABECALHOS_E_COLECOES' WHERE id=$1", [logId]);
    if (!options.resumeOnly) {
      const headers = summaryHeaders(await client.get(SUMMARY_ENDPOINT, { Page: 0, PageSize: 0 }));
      await repo.ingestHeaders(headers, startedAt);
      log('CICLO', 'Cabeçalhos e fila persistidos', { company, orders: headers.length });
    }
    let processed = 0, failures = 0, consecutiveFailures = 0;
    while (!options.shouldStop?.() && (options.maxOrders === undefined || processed < options.maxOrders)) {
      const orderId = await repo.next();
      if (orderId === null) break;
      processed++;
      const states: Record<string,string> = Object.fromEntries(collectionNames.map(name => [name,'PENDENTE']));
      let stage = 'cabecalho';
      try {
        await repo.start(orderId);
        const before = await fetchHeader(client, orderId);
        const children = {} as Children;
        for (const name of collectionNames) {
          stage = name;
          children[name] = await fetchCollection(client, orderId, name);
          states[name] = 'COLETADO';
        }
        stage = 'confirmacao_cabecalho';
        const after = await fetchHeader(client, orderId);
        const changed = before.header.status !== after.header.status || before.header.dataAtualizacao !== after.header.dataAtualizacao;
        // A transition to Processado during collection requires another pass.
        const final = before.header.status === 'Processado' && after.header.status === 'Processado' && !changed;
        stage = 'persistencia';
        await repo.persist(after, children, final, changed, logId);
        consecutiveFailures = 0;
        log('CICLO', 'OS e coleções persistidas', { company, orderId, finalized: final, requiresRecheck: changed });
      } catch (error) {
        failures++; consecutiveFailures++;
        states[stage] = 'ERRO';
        await repo.fail(orderId, error, states);
        log('CICLO', safeError(error), { company, orderId, stage });
        if (consecutiveFailures >= 3) break;
      }
    }
    const pending = await repo.pendingCount();
    const status = failures ? 'ERRO' : pending > 0 || options.maxOrders !== undefined ? 'LIMITADO' : 'CONCLUIDO';
    // This workflow uses per-OS completion, not the old date-based checkpoint.
    await integration.db.query(`UPDATE public.integracao_m8_log SET status=$2,data_fim=now(),
      duracao_ms=EXTRACT(EPOCH FROM(now()-data_inicio))*1000 WHERE id=$1`, [logId, status]);
    log('CICLO', 'Execução encerrada', { company, processed, pending, failures, status });
    return { processed, pending, failures };
  } catch (error) {
    if (logId) await integration.fail(logId,error).catch(() => undefined);
    throw error;
  } finally { await integration.unlock(company); }
}
