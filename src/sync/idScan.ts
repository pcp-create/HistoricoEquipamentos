import { fetchOrders, id } from '../m8/ordemServico.js';
import type { M8Client } from '../m8/client.js';
import { IntegrationRepository } from '../database/integracaoLog.repository.js';
import { persistPage } from '../database/ordensServico.repository.js';
import { transaction } from '../database/postgres.js';
import { log, SafeError } from '../utils/logger.js';
export interface IdScanOptions {
  fromId: number; toId: number; maxIds?: number;
  // Callers can request a graceful stop between IDs (SIGTERM/SIGINT).
  shouldStop?: () => boolean;
}
export async function scanIds(client: Pick<M8Client, 'company' | 'get' | 'timeZone'>, repo: IntegrationRepository, options: IdScanOptions) {
  const { fromId, toId, maxIds } = options;
  if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId < 1 || toId < fromId || toId > 2147483647) throw new SafeError('Intervalo de IDs inválido');
  if (maxIds !== undefined && (!Number.isInteger(maxIds) || maxIds < 1)) throw new SafeError('Limite de IDs inválido');
  const company = client.company;
  await repo.lock(company);
  let logId: string | undefined;
  try {
    await repo.db.query(`INSERT INTO public.integracao_m8_id_scan (company_id,from_id,to_id,last_id,status)
      VALUES ($1,$2,$3,$2-1,'EXECUTANDO') ON CONFLICT (company_id,from_id,to_id) DO NOTHING`, [company, fromId, toId]);
    const result = await repo.db.query<{ last_id: number; started_at: Date | string; status: string }>(
      'SELECT last_id,started_at,status FROM public.integracao_m8_id_scan WHERE company_id=$1 AND from_id=$2 AND to_id=$3', [company, fromId, toId]);
    const state = result.rows[0]!;
    if (state.status === 'CONCLUIDO') { log('ID_SCAN', 'Intervalo já concluído', { company, fromId, toId }); return; }
    const start = new Date(state.started_at);
    logId = await repo.start(company, 'INICIAL', { from: start, to: start });
    await repo.db.query("UPDATE public.integracao_m8_log SET processo='ORDENS_SERVICO_POR_ID' WHERE id=$1", [logId]);
    await repo.db.query("UPDATE public.integracao_m8_id_scan SET status='EXECUTANDO',updated_at=now() WHERE company_id=$1 AND from_id=$2 AND to_id=$3", [company, fromId, toId]);
    let current = state.last_id, processed = 0, found = 0;
    log('ID_SCAN', 'Iniciando/retomando varredura', { company, nextId: current + 1, toId });
    while (current < toId && (maxIds === undefined || processed < maxIds) && !options.shouldStop?.()) {
      const next = current + 1;
      const rows = await fetchOrders(client, 1, 2, { Id: String(next) });
      if (rows.length > 1 || rows.some(row => id(row.id) !== String(next))) throw new SafeError('Filtro Id não respeitado; varredura interrompida');
      // Commit OS + children before the resume cursor. A crash between commits replays
      // the same ID via UPSERT; it can never skip an uncommitted order.
      await persistPage(repo.db, company, rows, logId, next, client.timeZone);
      await repo.db.query(`UPDATE public.integracao_m8_id_scan SET last_id=$4,updated_at=now()
        WHERE company_id=$1 AND from_id=$2 AND to_id=$3`, [company, fromId, toId, next]);
      current = next; processed++; found += rows.length;
      if (processed % 100 === 0 || current === toId) log('ID_SCAN', 'Progresso persistido', { company, lastId: current, toId, processed, found });
    }
    const complete = current === toId;
    await transaction(repo.db, async () => {
      // The watermark is scan START (including resumes), never finish: old records may
      // change during the scan. Only an unrestricted scan starting at ID 1 sets a baseline.
      if (complete && fromId === 1 && maxIds === undefined) {
        await repo.db.query(`INSERT INTO public.integracao_m8_checkpoint(company_id,ultima_sincronizacao) VALUES ($1,$2)
          ON CONFLICT(company_id) DO UPDATE SET ultima_sincronizacao=GREATEST(integracao_m8_checkpoint.ultima_sincronizacao,EXCLUDED.ultima_sincronizacao),updated_at=now()`, [company, start.toISOString()]);
      }
      await repo.db.query(`UPDATE public.integracao_m8_id_scan SET status=$4,updated_at=now() WHERE company_id=$1 AND from_id=$2 AND to_id=$3`, [company, fromId, toId, complete && maxIds === undefined ? 'CONCLUIDO' : 'PAUSADO']);
      await repo.db.query(`UPDATE public.integracao_m8_log SET status=$2,data_fim=now(),duracao_ms=EXTRACT(EPOCH FROM(now()-data_inicio))*1000 WHERE id=$1`, [logId, complete && maxIds === undefined ? 'CONCLUIDO' : 'LIMITADO']);
    });
    log('ID_SCAN', complete ? 'Intervalo concluído' : 'Varredura pausada; retomada preservada', { company, lastId: current, processed, found });
  } catch (error) {
    if (logId) await repo.fail(logId, error).catch(() => undefined);
    await repo.db.query("UPDATE public.integracao_m8_id_scan SET status='ERRO',updated_at=now() WHERE company_id=$1 AND from_id=$2 AND to_id=$3", [company, fromId, toId]).catch(() => undefined);
    throw error;
  } finally { await repo.unlock(company); }
}
