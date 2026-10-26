import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "../database/postgres.js";
import { log, safeError } from "../utils/logger.js";
let stopped = false;
let child: ReturnType<typeof spawn> | undefined;
process.on("SIGTERM", () => { stopped = true; child?.kill("SIGTERM"); });
process.on("SIGINT", () => { stopped = true; child?.kill("SIGTERM"); });
async function run(script: string) {
  if (stopped) throw new Error("Interrompido");
  await new Promise<void>((resolve, reject) => {
    child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => { child = undefined; code === 0 && !stopped ? resolve() : reject(new Error("Coleta não concluída")); });
  });
}
async function main() {
  const db = await connectDatabase();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let jobId: string | undefined;
  let locked = false;
  try {
    locked = (await db.query("SELECT pg_try_advisory_lock(81045,1) AS ok")).rows[0]?.ok === true;
    if (!locked) return;
    const beat = () => db.query("INSERT INTO web_projection_sync_worker(id,heartbeat_at) VALUES(1,now()) ON CONFLICT(id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at");
    await beat();
    heartbeat = setInterval(() => { void beat().catch(() => { stopped = true; child?.kill("SIGTERM"); }); }, 15000);
    // Owning the session lock proves a previous runner is no longer active.
    await db.query("UPDATE web_projection_sync_jobs SET state='failed',finished_at=now(),message='Integrador interrompido. Confira o log e solicite uma nova sincronização.' WHERE state='running'");
    const job = (await db.query("UPDATE web_projection_sync_jobs SET state='running',started_at=now(),stage='Atualizando contratos, faturamentos e devoluções' WHERE id=(SELECT id FROM web_projection_sync_jobs WHERE state='queued' ORDER BY requested_at LIMIT 1) RETURNING id")).rows[0];
    if (!job) return;
    jobId = job.id;
    await run("./syncCommercialFacts.js");
    await db.query("UPDATE web_projection_sync_jobs SET stage='Atualizando ordens de serviço' WHERE id=$1", [jobId]);
    await run("./syncCycle.js");
    await db.query("UPDATE web_projection_sync_jobs SET state='complete',stage='Sincronização concluída',finished_at=now() WHERE id=$1", [jobId]);
  } catch (error) {
    if (jobId) await db.query("UPDATE web_projection_sync_jobs SET state='failed',finished_at=now(),message='Uma coleta falhou ou foi interrompida. Parte dos dados pode ter sido atualizada. Confira os logs do integrador.' WHERE id=$1", [jobId]).catch(() => undefined);
    log("SINCRONIZACAO_MANUAL", safeError(error)); process.exitCode = 1;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (locked) await db.query("SELECT pg_advisory_unlock(81045,1)").catch(() => undefined);
    await db.end();
  }
}
await main().catch((error) => { log("SINCRONIZACAO_MANUAL", safeError(error)); process.exitCode = 1; });
