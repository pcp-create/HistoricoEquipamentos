import "server-only";
import type { PoolClient } from "pg";
import { parseRecurrence, nextOccurrence, recurrenceLabel } from "./recurrence";
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
      `SELECT r.id::text,r.scheduled_at,r.state,r.attempts,r.sent_at,r.series_id,r.occurrence_index,s.rule,s.active series_active,u.display_name recipient_name FROM web_task_reminders r LEFT JOIN web_task_reminder_series s ON s.id=r.series_id LEFT JOIN web_user_access u ON u.email=r.recipient WHERE r.task_id=$1 ORDER BY r.scheduled_at DESC`,
      [task],
    )
  ).rows;
}
export async function saveReminder(b: any, actor: string, client?: PoolClient) {
  if (!validId(b?.taskId) || !["create", "edit", "cancel"].includes(b.action))
    throw new TaskInputError("Alerta inválido.");
  const when = b.action !== "cancel" ? reminderInstant(b.when) : null;
  let rule;
  try {
    rule = b.action !== "cancel" ? parseRecurrence(b.recurrence, b.when) : null;
  } catch (e) {
    throw new TaskInputError((e as Error).message);
  }
  const c = client || await database().connect();
  try {
    if (!client) await c.query("BEGIN READ WRITE");
    const t = (
      await c.query("SELECT * FROM web_tasks WHERE id=$1 FOR UPDATE", [
        b.taskId,
      ])
    ).rows[0];
    if (!t) throw new TaskInputError("Tarefa não encontrada.");
    let description = "";
    if (b.action === "edit") {
      if (!validId(b.id)) throw new TaskInputError("Alerta inválido.");
      if (t.status === "completed") throw new TaskInputError("A tarefa está concluída.");
      const reference = (await c.query("SELECT series_id FROM web_task_reminders WHERE id=$1 AND task_id=$2",[b.id,b.taskId])).rows[0];
      if (reference?.series_id) await c.query("SELECT id FROM web_task_reminder_series WHERE id=$1 FOR UPDATE",[reference.series_id]);
      const current = (await c.query("SELECT * FROM web_task_reminders WHERE id=$1 AND task_id=$2 FOR UPDATE",[b.id,b.taskId])).rows[0];
      if (!current || current.state !== "pending" || current.attempts > 0 || (current.leased_until && new Date(current.leased_until).getTime() > Date.now()))
        throw new TaskConflict("Alerta já enviado, cancelado ou em envio.");
      if (!b.expectedWhen || new Date(current.scheduled_at).toISOString() !== b.expectedWhen)
        throw new TaskConflict("O alerta foi alterado. Atualize antes de editar.");
      const duplicate = (await c.query("SELECT id FROM web_task_reminders WHERE task_id=$1 AND scheduled_at=$2 AND recipient=$3 AND id<>$4",[b.taskId,when,current.recipient,b.id])).rows[0];
      if (duplicate) throw new TaskInputError("Já existe um alerta para este horário e responsável.");
      if (current.series_id) await c.query("UPDATE web_task_reminder_series SET active=false WHERE id=$1",[current.series_id]);
      const series = rule ? randomUUID() : null;
      if (series) await c.query("INSERT INTO web_task_reminder_series(id,task_id,anchor_local,rule) VALUES($1,$2,$3,$4)",[series,b.taskId,b.when,JSON.stringify(rule)]);
      await c.query("UPDATE web_task_reminders SET scheduled_at=$2,series_id=$3,occurrence_index=0,lease_token=NULL,leased_until=NULL WHERE id=$1",[b.id,when,series]);
      description = `Alerta alterado de ${new Date(current.scheduled_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} para ${new Date(when!).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} (Brasília). Destinatário mantido. ${recurrenceLabel(rule)}.`;
    } else if (b.action === "create") {
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
      const series = rule ? randomUUID() : null;
      if (series)
        await c.query(
          "INSERT INTO web_task_reminder_series(id,task_id,anchor_local,rule) VALUES($1,$2,$3,$4)",
          [series, b.taskId, b.when, JSON.stringify(rule)],
        );
      const result = await c.query(
        `INSERT INTO web_task_reminders(task_id,scheduled_at,recipient,created_by,series_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
        [b.taskId, when, t.assigned_to, actor, series],
      );
      if (!result.rows.length)
        throw new TaskInputError(
          "Já existe um alerta para este horário e responsável.",
        );
      description = `Alerta agendado para ${new Date(when!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília). Destinatário: ${u.display_name || "Funcionário"}. ${recurrenceLabel(rule)}.`;
    } else {
      if (!validId(b.id)) throw new TaskInputError("Alerta inválido.");
      const current = (
        await c.query(
          "SELECT series_id FROM web_task_reminders WHERE id=$1 AND task_id=$2",
          [b.id, b.taskId],
        )
      ).rows[0];
      if (current?.series_id)
        await c.query(
          "SELECT id FROM web_task_reminder_series WHERE id=$1 FOR UPDATE",
          [current.series_id],
        );
      const result = await c.query(
        `UPDATE web_task_reminders SET state='cancelled' WHERE id=$1 AND task_id=$2 AND state='pending' AND (leased_until IS NULL OR leased_until<now()) RETURNING id`,
        [b.id, b.taskId],
      );
      if (!result.rows.length)
        throw new TaskConflict("Alerta já enviado, cancelado ou em envio.");
      if (current?.series_id)
        await c.query(
          "UPDATE web_task_reminder_series SET active=false WHERE id=$1",
          [current.series_id],
        );
      description = current?.series_id
        ? "Recorrência cancelada. Nenhum próximo alerta desta série será enviado."
        : "Alerta agendado cancelado.";
    }
    await c.query(
      `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,false,$4,coalesce((SELECT display_name FROM web_user_access WHERE email=$4),'Usuário'))`,
      [
        b.taskId,
        b.action === "edit" ? "Alerta alterado" : b.action === "create" ? "Alerta agendado" : "Alerta cancelado",
        description,
        actor,
      ],
    );
    await c.query(
      "UPDATE web_tasks SET updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1",
      [b.taskId, actor],
    );
    if (!client) await c.query("COMMIT");
  } catch (e) {
    if (!client) await c.query("ROLLBACK");
    throw e;
  } finally {
    if (!client) c.release();
  }
}
export async function claimReminders(origin: string) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const rows = (
      await c.query(
        `SELECT r.*,to_jsonb(t)->>'restricted' restricted,u.role recipient_role,t.title,t.origin,t.status,u.enabled,u.phone FROM web_task_reminders r JOIN web_tasks t ON t.id=r.task_id LEFT JOIN web_user_access u ON u.email=r.recipient LEFT JOIN web_task_reminder_series s ON s.id=r.series_id WHERE (r.series_id IS NULL OR s.active) AND r.state='pending' AND r.attempts=0 AND r.scheduled_at<=now() AND (r.leased_until IS NULL OR r.leased_until<now()) ORDER BY r.scheduled_at LIMIT 20 FOR UPDATE OF r SKIP LOCKED`,
      )
    ).rows;
    const result = [];
    for (const r of rows) {
      if (r.status !== "completed") await c.query(`INSERT INTO web_task_notifications(task_id,task_version,recipient,kind,reminder_id)
        SELECT t.id,t.version,u.email,'reminder',$1 FROM web_tasks t JOIN web_user_access u ON u.email=ANY(t.followers)
        WHERE t.id=$2 AND u.email<>$3 ON CONFLICT DO NOTHING`,[r.id,r.task_id,r.recipient]);
      if (
        (r.restricted === "true" && r.recipient_role !== "admin") ||
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
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const existing = (
      await c.query("SELECT series_id FROM web_task_reminders WHERE id=$1", [
        id,
      ])
    ).rows[0];
    const series = existing?.series_id
      ? (
          await c.query(
            "SELECT * FROM web_task_reminder_series WHERE id=$1 FOR UPDATE",
            [existing.series_id],
          )
        ).rows[0]
      : null;
    const reminder = (
      await c.query("SELECT * FROM web_task_reminders WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (
      !reminder ||
      reminder.lease_token !== token ||
      !["pending", "sent"].includes(reminder.state)
    )
      throw new TaskConflict("Entrega reclamada por outra execução.");
    if (reminder.state === "pending") {
      await c.query(
        "UPDATE web_task_reminders SET state='sent',sent_at=now() WHERE id=$1",
        [id],
      );
      const task = (
        await c.query("SELECT status FROM web_tasks WHERE id=$1", [
          reminder.task_id,
        ])
      ).rows[0];
      if (series?.active && task?.status !== "completed") {
        let index = reminder.occurrence_index,
          inserted = false;
        for (let attempt = 0; attempt < 1000; attempt++) {
          const next = nextOccurrence(
            series.anchor_local,
            series.rule,
            index,
            Date.now(),
          );
          if (!next) break;
          index = next.index;
          const r = await c.query(
            `INSERT INTO web_task_reminders(task_id,scheduled_at,recipient,created_by,series_id,occurrence_index) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
            [
              reminder.task_id,
              next.when,
              reminder.recipient,
              reminder.created_by,
              series.id,
              index,
            ],
          );
          if (r.rows.length) {
            inserted = true;
            break;
          }
        }
        if (!inserted)
          await c.query(
            "UPDATE web_task_reminder_series SET active=false WHERE id=$1",
            [series.id],
          );
      }
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
