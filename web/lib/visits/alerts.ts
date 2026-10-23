import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
import { TaskInputError, TaskConflict } from "../tasks/store";
export async function queueVisitAlert(
  c: any,
  visitId: string,
  email: string,
  when: unknown,
) {
  if (!when) return;
  if (typeof when !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when))
    throw new AdminInputError("Informe data e hora do alerta.");
  const at = new Date(when + ":00-03:00");
  if (
    !Number.isFinite(at.getTime()) ||
    at.getTime() <= Date.now() ||
    new Date(at.getTime() - 10800000).toISOString().slice(0, 16) !== when
  )
    throw new AdminInputError(
      "Escolha uma data futura válida para o alerta de WhatsApp.",
    );
  const u = (
    await c.query("SELECT phone,enabled FROM web_user_access WHERE email=$1", [
      email,
    ])
  ).rows[0];
  if (!u?.enabled || !u.phone)
    throw new AdminInputError(
      "Cadastre seu WhatsApp no usuário para receber o alerta.",
    );
  await c.query(
    "INSERT INTO web_sales_visit_alerts(id,visit_id,recipient,scheduled_at) VALUES($1,$2,$3,$4) ON CONFLICT(visit_id,recipient,scheduled_at) DO NOTHING",
    [randomUUID(), visitId, email, at],
  );
}
export async function claimVisitAlerts(origin: string) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const rows = (
      await c.query(
        `SELECT a.*,u.phone,u.enabled,v.status,v.scheduled_at visit_at,v.description,v.outcome,v.contact,v.customer_key,COALESCE(l.name,(SELECT d.name FROM m8_customer_directory d WHERE 'm8:'||d.person_id::text=v.customer_key LIMIT 1)) customer FROM web_sales_visit_alerts a JOIN web_sales_visits v ON v.id=a.visit_id JOIN web_user_access u ON u.email=a.recipient LEFT JOIN web_sales_leads l ON 'lead:'||l.id::text=v.customer_key WHERE a.state='pending' AND a.attempts=0 AND a.scheduled_at<=now() ORDER BY a.scheduled_at LIMIT 20 FOR UPDATE OF a SKIP LOCKED`,
      )
    ).rows;
    const result = [];
    for (const r of rows) {
      if (!r.enabled || !r.phone || r.status === "cancelled") {
        await c.query(
          "UPDATE web_sales_visit_alerts SET state='skipped' WHERE id=$1",
          [r.id],
        );
        continue;
      }
      const token = randomUUID();
      await c.query(
        "UPDATE web_sales_visit_alerts SET attempts=attempts+1,lease_token=$2 WHERE id=$1",
        [r.id, token],
      );
      result.push({
        id: "visit:" + r.id,
        token,
        number: r.phone,
        text: `🔔 *Alerta de visita*\n${r.customer || r.customer_key}\n${new Date(r.visit_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\nContato: ${r.contact}\n${r.outcome || r.description}\n${origin}/visitas`,
      });
    }
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function acknowledgeVisitAlert(id: string, token: unknown) {
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    typeof token !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(token)
  )
    throw new TaskInputError("Confirmação inválida.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const r = await c.query(
      "UPDATE web_sales_visit_alerts SET state='sent',sent_at=COALESCE(sent_at,now()) WHERE id=$1 AND lease_token=$2 AND state IN ('pending','sent') RETURNING id",
      [id, token],
    );
    if (!r.rows.length)
      throw new TaskConflict("Alerta não corresponde ao envio.");
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
