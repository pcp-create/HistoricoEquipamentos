import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { TaskInputError, TaskConflict } from "./store";
const validId = (id: unknown) =>
  typeof id === "string" && /^[1-9]\d{0,17}$/.test(id);
export function reminderInstant(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    throw new TaskInputError("Informe data e hora válidas.");
  const time = Date.parse(value + "-03:00");
  if (
    !Number.isFinite(time) ||
    new Date(time - 3 * 3600000).toISOString().slice(0, 16) !== value ||
    time <= Date.now()
  )
    throw new TaskInputError(
      "Escolha uma data e hora futuras, no horário de Brasília.",
    );
  return new Date(time).toISOString();
}
export async function listReminders(task: unknown) {
  if (!validId(task)) throw new TaskInputError("Tarefa inválida.");
  return (
    await database().query(
      `SELECT r.id::text,r.scheduled_at,r.state,r.sent_at,u.display_name recipient_name FROM web_task_reminders r LEFT JOIN web_user_access u ON u.email=r.recipient WHERE r.task_id=$1 ORDER BY r.scheduled_at DESC`,
      [task],
    )
  ).rows;
}
export async function saveReminder(b: any, actor: string) {
  if (!validId(b?.taskId) || !["create", "cancel"].includes(b.action))
    throw new TaskInputError("Alerta inválido.");
  const when = b.action === "create" ? reminderInstant(b.when) : null;
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const t = (
      await c.query("SELECT * FROM web_tasks WHERE id=$1 FOR UPDATE", [
        b.taskId,
      ])
    ).rows[0];
    if (!t) throw new TaskInputError("Tarefa não encontrada.");
    let description = "";
    if (b.action === "create") {
      if (t.status === "completed")
        throw new TaskInputError("A tarefa está concluída.");
      const u = (
        await c.query(
          "SELECT * FROM web_user_access WHERE email=$1 AND enabled FOR SHARE",
          [t.assigned_to],
        )
      ).rows[0];
      if (!u || !/^\d{10,15}$/.test(u.phone || ""))
        throw new TaskInputError(
          "Atribua a tarefa a um funcionário ativo com WhatsApp cadastrado.",
        );
      const result = await c.query(
        `INSERT INTO web_task_reminders(task_id,scheduled_at,recipient,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
        [b.taskId, when, t.assigned_to, actor],
      );
      if (!result.rows.length)
        throw new TaskInputError(
          "Já existe um alerta para este horário e responsável.",
        );
      description = `Alerta agendado para ${new Date(when!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília). Destinatário: ${u.display_name || "Funcionário"}.`;
    } else {
      if (!validId(b.id)) throw new TaskInputError("Alerta inválido.");
      const result = await c.query(
        `UPDATE web_task_reminders SET state='cancelled' WHERE id=$1 AND task_id=$2 AND state='pending' AND (leased_until IS NULL OR leased_until<now()) RETURNING id`,
        [b.id, b.taskId],
      );
      if (!result.rows.length)
        throw new TaskConflict("Alerta já enviado, cancelado ou em envio.");
      description = "Alerta agendado cancelado.";
    }
    await c.query(
      `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,false,$4,coalesce((SELECT display_name FROM web_user_access WHERE email=$4),'Usuário'))`,
      [
        b.taskId,
        b.action === "create" ? "Alerta agendado" : "Alerta cancelado",
        description,
        actor,
      ],
    );
    await c.query(
      "UPDATE web_tasks SET updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1",
      [b.taskId, actor],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function claimReminders(origin: string) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const rows = (
      await c.query(
        `SELECT r.*,t.title,t.origin,t.status,u.enabled,u.phone FROM web_task_reminders r JOIN web_tasks t ON t.id=r.task_id LEFT JOIN web_user_access u ON u.email=r.recipient WHERE r.state='pending' AND r.scheduled_at<=now() AND (r.leased_until IS NULL OR r.leased_until<now()) ORDER BY r.scheduled_at LIMIT 20 FOR UPDATE OF r SKIP LOCKED`,
      )
    ).rows;
    const result = [];
    for (const r of rows) {
      if (
        r.status === "completed" ||
        !r.enabled ||
        !/^\d{10,15}$/.test(r.phone || "")
      ) {
        await c.query(
          "UPDATE web_task_reminders SET state='skipped' WHERE id=$1",
          [r.id],
        );
        continue;
      }
      const token = randomUUID();
      await c.query(
        "UPDATE web_task_reminders SET lease_token=$2,leased_until=now()+interval '30 minutes',attempts=attempts+1 WHERE id=$1",
        [r.id, token],
      );
      result.push({
        id: "reminder:" + r.id,
        token,
        number: r.phone,
        text: `⏰ *Lembrete de tarefa*\n*TAR-${r.task_id} · ${r.title}*\nOrigem: ${r.origin}\nAgendado para: ${new Date(r.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)\n${origin}/tarefas?task=${r.task_id}`,
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
export async function acknowledgeReminder(id: string, token: unknown) {
  if (
    !validId(id) ||
    typeof token !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(token)
  )
    throw new TaskInputError("Confirmação inválida.");
  const c=await database().connect();
  try {
  await c.query("BEGIN READ WRITE");
  const r = await c.query(
    "UPDATE web_task_reminders SET state='sent',sent_at=coalesce(sent_at,now()) WHERE id=$1 AND lease_token=$2 AND state IN('pending','sent') RETURNING id",
    [id, token],
  );
  if (!r.rows.length)
    throw new TaskConflict("Entrega reclamada por outra execução.");
  await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
