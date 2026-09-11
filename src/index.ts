import { pathToFileURL } from 'node:url';
import { m8Config, integer, type Env } from './config/env.js';
import { connectDatabase } from './database/postgres.js';
import { IntegrationRepository, type SyncMode } from './database/integracaoLog.repository.js';
import { M8Client } from './m8/client.js';
import { syncCompany } from './sync/syncOrdensServico.js';
import { testCommunication } from './scripts/testM8.js';
import { parseDate } from './utils/dates.js';
import { SafeError, safeError, log } from './utils/logger.js';

export function syncSettings(env: Env, args: string[], end: Date) {
  const mode = args[0] as SyncMode;
  if (!['INICIAL', 'INCREMENTAL', 'REPROCESSAMENTO', 'TESTE'].includes(mode)) throw new SafeError('Modo inválido');
  const flags = new Map<string, string>();
  for (const arg of args.slice(1)) {
    const match = /^--(from|to)=(.+)$/.exec(arg);
    if (!match || flags.has(match[1]!)) throw new SafeError('Argumento inválido/duplicado; use --from=... --to=...');
    flags.set(match[1]!, match[2]!);
  }
  const bounded = mode === 'REPROCESSAMENTO' || mode === 'TESTE';
  if (flags.size && !bounded) throw new SafeError('--from/--to são exclusivos de reprocessamento/teste');
  if (bounded && flags.size !== 2) throw new SafeError('Informe --from e --to');
  const reprocess = bounded ? { from: parseDate(flags.get('from')!), to: parseDate(flags.get('to')!, true) } : undefined;
  if (reprocess && reprocess.from > reprocess.to) throw new SafeError('Período inicial posterior ao final');
  if (mode !== 'TESTE' && env.M8_PAGINATION_VALIDATED !== 'true') throw new SafeError('Execute m8:test e m8:test:pagination nas três empresas; depois configure M8_PAGINATION_VALIDATED=true');
  const initialField = env.INITIAL_SYNC_DATE_FIELD || 'atualizacao';
  if (initialField !== 'atualizacao' && initialField !== 'emissao') throw new SafeError('INITIAL_SYNC_DATE_FIELD deve ser atualizacao ou emissao');
  return {
    mode, end, reprocess, initialField: initialField as 'atualizacao' | 'emissao',
    initialStart: parseDate(env.INITIAL_SYNC_START_DATE || '2020-01-01'),
    months: integer(env.INITIAL_SYNC_WINDOW_MONTHS, 1, 'INITIAL_SYNC_WINDOW_MONTHS', 120),
    overlapMinutes: integer(env.SYNC_OVERLAP_MINUTES, 10, 'SYNC_OVERLAP_MINUTES', 1440),
    maxPages: env.SYNC_MAX_PAGES ? integer(env.SYNC_MAX_PAGES, 2, 'SYNC_MAX_PAGES') : undefined,
  };
}
async function main() {
  // Fixed before authentication or any company is processed.
  const end = new Date();
  let config, settings;
  try { config = m8Config(); settings = syncSettings(process.env, process.argv.slice(2), end); }
  catch (error) {
    log('CONFIG', error instanceof Error && !(error instanceof TypeError) ? error.message : 'Configuração inválida');
    process.exitCode = 1; return;
  }
  // Never start historical persistence before basic authentication/payload validation for all companies.
  if (settings.mode === 'INICIAL') {
    for (const company of config.companies) await testCommunication(new M8Client(config, company));
  }
  const db = await connectDatabase();
  try {
    const repo = new IntegrationRepository(db);
    for (const company of config.companies) {
      try { await syncCompany(new M8Client(config, company), repo, { ...settings, company, pageSize: config.pageSize, timeZone: config.timeZone }); }
      catch (error) { log('SYNC', safeError(error), { company }); process.exitCode = 1; }
    }
  } finally { await db.end(); }
}
// This file is the CLI entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main().catch(error => { log('SYNC', safeError(error)); process.exitCode = 1; });
