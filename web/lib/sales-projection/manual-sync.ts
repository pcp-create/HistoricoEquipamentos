import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
export class SyncInputError extends Error {}
export async function manualSyncStatus() {
  const db = database();
  const [worker, jobs] = await Promise.all([
    db.query("SELECT heartbeat_at,heartbeat_at > now()-interval '2 minutes' online FROM web_projection_sync_worker WHERE id=1"),
    db.query("SELECT id,state,stage,requested_at,started_at,finished_at,message FROM web_projection_sync_jobs ORDER BY requested_at DESC LIMIT 1"),
  ]);
  return { online: worker.rows[0]?.online === true, job: jobs.rows[0] || null };
}
export async function requestManualSync(email: string) {
  const client = await database().connect();
  try {
    await client.query("BEGIN READ WRITE");
    await client.query("SELECT pg_advisory_xact_lock(81045,2)");
    const active = (await client.query("SELECT id FROM web_projection_sync_jobs WHERE state IN('queued','running') LIMIT 1")).rows[0];
    if (!active) {
      const online = (await client.query("SELECT heartbeat_at > now()-interval '2 minutes' online FROM web_projection_sync_worker WHERE id=1")).rows[0]?.online;
      if (!online) throw new SyncInputError("Integrador manual indisponível. Instale ou ative o serviço m8-projecao-manual no servidor.");
      const recent = (await client.query("SELECT 1 FROM web_projection_sync_jobs WHERE requested_at > now()-interval '1 minute' OR (state='complete' AND finished_at > now()-interval '5 minutes') LIMIT 1")).rows.length;
      if (recent) throw new SyncInputError("Uma sincronização foi solicitada recentemente. Aguarde alguns minutos antes de repetir.");
      await client.query("INSERT INTO web_projection_sync_jobs(id,requested_by,state) VALUES($1,$2,'queued')", [randomUUID(), email]);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  return manualSyncStatus();
}
