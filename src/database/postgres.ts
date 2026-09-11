import pg from 'pg';
import { readFileSync } from 'node:fs';
import { required, type Env } from '../config/env.js';
import { SafeError } from '../utils/logger.js';
export interface Database {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
}
export async function connectDatabase(env: Env = process.env): Promise<pg.Client> {
  const connectionString = required(env, 'DATABASE_URL');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new SafeError('DATABASE_URL precisa ser PostgreSQL');
  if (url.port === '6543') throw new SafeError('Use conexão direta ou Session pooler; porta 6543 não suporta o lock de sessão utilizado');
  // URL SSL options must not override certificate verification.
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('ssl')) throw new SafeError('Remova opções ssl da DATABASE_URL; TLS é configurado e validado pelo integrador');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (env.DATABASE_SSL_DISABLED === 'true' && !local) throw new SafeError('TLS só pode ser desabilitado em PostgreSQL local');
  const client = new pg.Client({
    connectionString, connectionTimeoutMillis: 15000, statement_timeout: 120000,
    ssl: env.DATABASE_SSL_DISABLED === 'true' ? false : {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA_FILE ? { ca: readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8') } : {}),
    },
  });
  // Prevent an idle connection failure from becoming an unhandled EventEmitter error.
  client.on('error', () => { /* The next query fails; checkpoint cannot advance. */ });
  await client.connect();
  await client.query("SET TIME ZONE 'UTC'");
  return client;
}
export async function transaction<T>(db: Database, work: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try { const result = await work(); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK').catch(() => undefined); throw error; }
}
