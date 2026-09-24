import { Client } from "pg";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const email = "atendimento@rjserranacompressores.com.br";
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync(
      new URL("../certs/supabase-ca.crt", import.meta.url),
      "utf8",
    ),
  },
});
const batch = randomUUID();
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(81021,1)");
  const user = (
    await db.query(
      "SELECT display_name FROM web_user_access WHERE email=$1 AND enabled FOR SHARE",
      [email],
    )
  ).rows[0];
  if (!user) throw Error("Sara não está ativa");
  const before = (
    await db.query(
      `SELECT * FROM web_tasks WHERE origin IN ('Máquina de Locação','Máquina Emprestada') AND status<>'completed' AND source_key NOT LIKE 'manual:%' AND assigned_to IS DISTINCT FROM $1 FOR UPDATE`,
      [email],
    )
  ).rows;
  const ids = before.map((t) => t.id);
  const leased = await db.query(
    `SELECT id FROM web_task_notifications WHERE task_id=ANY($1::bigint[]) AND state='pending' AND leased_until>now() FOR UPDATE`,
    [ids],
  );
  if (leased.rows.length)
    throw Error("Há avisos em envio; tente após o processamento.");
  await db.query(
    `UPDATE web_task_notifications SET state='skipped' WHERE task_id=ANY($1::bigint[]) AND state='pending'`,
    [ids],
  );
  await db.query(
    `UPDATE web_tasks SET assigned_to=$2,status='in_progress',first_assigned_at=coalesce(first_assigned_at,now()),updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=ANY($1::bigint[])`,
    [ids, email],
  );
  await db.query(
    `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) SELECT unnest($1::bigint[]),'Atribuição em massa',$2,true,'Sistema','Sistema'`,
    [
      ids,
      `Atribuído a: ${user.display_name}. Regra de locações/empréstimos. Carga sem envio de mensagens. Lote ${batch}.`,
    ],
  );
  await db.query(
    `INSERT INTO web_access_events(event,email,actor,details) VALUES('task_rental_assignment','Sistema','Sistema',$1)`,
    [JSON.stringify({ batch, assignee: email, before, notifications: 0 })],
  );
  const count = (
    await db.query(
      `SELECT count(*) FROM web_tasks WHERE id=ANY($1::bigint[]) AND assigned_to=$2`,
      [ids, email],
    )
  ).rows[0].count;
  if (Number(count) !== ids.length) throw Error("Falha na conferência");
  await db.query("COMMIT");
  const report = { batch, assigned: ids.length, notifications: 0, ids };
  mkdirSync(new URL("../../.m8/task-territories/", import.meta.url), {
    recursive: true,
  });
  writeFileSync(
    new URL(
      `../../.m8/task-territories/rentals-${batch}.json`,
      import.meta.url,
    ),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  await db.end();
}
