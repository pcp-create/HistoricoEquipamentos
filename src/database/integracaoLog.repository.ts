import { transaction, type Database } from './postgres.js';
import { SafeError, safeError } from '../utils/logger.js';
import type { Window } from '../utils/dates.js';
export type SyncMode = 'INICIAL' | 'INCREMENTAL' | 'REPROCESSAMENTO' | 'TESTE';
export class IntegrationRepository {
  constructor(readonly db: Database) {}
  async lock(company: number) {
    const { rows } = await this.db.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(81008, $1) AS locked', [company]);
    if (!rows[0]?.locked) throw new SafeError(`Já existe execução ativa para a empresa ${company}`);
    // A session lock is released automatically on crash/disconnect. Previous unfinished runs were interrupted.
    await this.db.query(`UPDATE public.integracao_m8_log SET status='ERRO', data_fim=now(),
      erro='Execução anterior interrompida; checkpoint preservado' WHERE company_id=$1 AND status='EXECUTANDO'`, [company]);
  }
  async unlock(company: number) { await this.db.query('SELECT pg_advisory_unlock(81008, $1)', [company]); }
  async checkpoint(company: number): Promise<Date | null> {
    const { rows } = await this.db.query<{ ultima_sincronizacao: Date | string }>('SELECT ultima_sincronizacao FROM public.integracao_m8_checkpoint WHERE company_id=$1', [company]);
    return rows[0] ? new Date(rows[0].ultima_sincronizacao) : null;
  }
  async start(company: number, mode: SyncMode, window: Window): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(`INSERT INTO public.integracao_m8_log
      (company_id,tipo_execucao,periodo_inicial,periodo_final,status) VALUES ($1,$2,$3,$4,'EXECUTANDO') RETURNING id`,
    [company, mode, window.from.toISOString(), window.to.toISOString()]);
    return String(rows[0]!.id);
  }
  async finish(logId: string, company: number, mode: SyncMode, end: Date, limited: boolean) {
    await transaction(this.db, async () => {
      if (!limited && (mode === 'INICIAL' || mode === 'INCREMENTAL')) {
        await this.db.query(`INSERT INTO public.integracao_m8_checkpoint (company_id,ultima_sincronizacao) VALUES ($1,$2)
          ON CONFLICT (company_id) DO UPDATE SET ultima_sincronizacao=GREATEST(integracao_m8_checkpoint.ultima_sincronizacao,EXCLUDED.ultima_sincronizacao), updated_at=now()`, [company, end.toISOString()]);
      }
      await this.db.query(`UPDATE public.integracao_m8_log SET status=$2, data_fim=now(),
        duracao_ms=EXTRACT(EPOCH FROM (now()-data_inicio))*1000 WHERE id=$1`, [logId, limited ? 'LIMITADO' : 'CONCLUIDO']);
    });
  }
  async fail(logId: string, error: unknown) {
    await this.db.query(`UPDATE public.integracao_m8_log SET status='ERRO', erro=$2, data_fim=now(),
      duracao_ms=EXTRACT(EPOCH FROM (now()-data_inicio))*1000 WHERE id=$1`, [logId, safeError(error)]);
  }
}
