import { createHash } from 'node:crypto';
import type { M8Client } from '../m8/client.js';
import { fetchOrders, id } from '../m8/ordemServico.js';
import { persistPage } from '../database/ordensServico.repository.js';
import { IntegrationRepository, type SyncMode } from '../database/integracaoLog.repository.js';
import { monthWindows, type Window } from '../utils/dates.js';
import { log, SafeError } from '../utils/logger.js';
export interface SyncOptions {
  company: number; mode: SyncMode; end: Date; initialStart: Date; pageSize: number;
  months: number; overlapMinutes: number; maxPages?: number; reprocess?: Window;
  initialField: 'atualizacao' | 'emissao'; timeZone?: string;
}
export async function syncCompany(client: Pick<M8Client, 'get'>, repo: IntegrationRepository, options: SyncOptions) {
  const { company, mode, end } = options;
  await repo.lock(company);
  let logId: string | undefined;
  try {
    let from: Date;
    let to = end;
    if (mode === 'INCREMENTAL') {
      const checkpoint = await repo.checkpoint(company);
      if (!checkpoint) throw new SafeError(`Empresa ${company} sem carga inicial concluída; execute sync:initial`);
      if (checkpoint > end) throw new SafeError('Checkpoint no futuro; verificar relógio');
      from = new Date(checkpoint.getTime() - options.overlapMinutes * 60000);
    } else if (mode === 'REPROCESSAMENTO' || mode === 'TESTE') {
      if (!options.reprocess) throw new SafeError('Informe --from e --to');
      ({ from, to } = options.reprocess);
    } else from = options.initialStart;
    if (from > to) throw new SafeError('Período inicial posterior ao final');
    logId = await repo.start(company, mode, { from, to });
    log('SYNC', 'Iniciando sincronização', { company, mode, from: from.toISOString(), to: to.toISOString() });
    const dateField = mode === 'INICIAL' && options.initialField === 'emissao' ? 'Emissao' : 'DataAtualizacao';
    let pages = 0;
    const limited = options.maxPages !== undefined || mode === 'TESTE';
    const maxPages = options.maxPages ?? (mode === 'TESTE' ? 2 : Infinity);
    outer: for (const window of monthWindows(from, to, options.months)) {
      const fingerprints = new Set<string>();
      let previousIds = new Set<string>();
      for (let page = 1; ; page++) {
        await repo.db.query('UPDATE public.integracao_m8_log SET pagina_atual=$2 WHERE id=$1', [logId, page]);
        log('M8', 'Buscando página', { company, page });
        const orders = await fetchOrders(client, page, options.pageSize, {
          [`${dateField}Inicial`]: window.from.toISOString(), [`${dateField}Final`]: window.to.toISOString(),
        });
        if (orders.length > 0) {
          const ids = orders.map(row => id(row.id));
          const fingerprint = createHash('sha256').update([...ids].sort().join(',')).digest('hex');
          if (fingerprints.has(fingerprint) || ids.some(key => previousIds.has(key))) {
            throw new SafeError('Paginação repetiu OS entre páginas; execução interrompida sem avançar checkpoint');
          }
          fingerprints.add(fingerprint);
          previousIds = new Set(ids);
        }
        await persistPage(repo.db, company, orders, logId, page, options.timeZone);
        pages++;
        log('SYNC', 'Página persistida', { company, page, recebidos: orders.length });
        if (pages >= maxPages) break outer;
        if (orders.length < options.pageSize) break;
      }
    }
    await repo.finish(logId, company, mode, to, limited);
    log('SYNC', limited ? 'Teste limitado; checkpoint preservado' : 'Sincronização concluída', { company, pages });
  } catch (error) {
    if (logId) await repo.fail(logId, error).catch(() => log('DB', 'Não foi possível registrar falha; checkpoint não avançado', { company }));
    throw error;
  } finally { await repo.unlock(company); }
}
