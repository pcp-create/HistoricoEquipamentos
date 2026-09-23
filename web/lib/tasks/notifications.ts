import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { TaskInputError, TaskConflict } from "./store";
export async function claimNotifications(origin: string) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const rows = (
      await c.query(
        `SELECT n.*,u.phone,u.enabled,t.title,t.origin,t.equipment_name,t.status,t.assigned_to,NOT EXISTS(SELECT 1 FROM web_task_notifications newer WHERE newer.task_id=n.task_id AND newer.id>n.id) current_assignment FROM web_task_notifications n JOIN web_user_access u ON u.email=n.recipient JOIN web_tasks t ON t.id=n.task_id WHERE n.state='pending' AND (n.leased_until IS NULL OR n.leased_until<now()) ORDER BY n.id LIMIT 20 FOR UPDATE OF n SKIP LOCKED`,
      )
    ).rows;
    const result = [];
    for (const n of rows) {
      if (
        !n.current_assignment ||
        !n.enabled ||
        !n.phone ||
        n.status === "completed" ||
        n.assigned_to !== n.recipient
      ) {
        await c.query(
          "UPDATE web_task_notifications SET state='skipped' WHERE id=$1",
          [n.id],
        );
        continue;
      }
      const token = randomUUID();
      await c.query(
        "UPDATE web_task_notifications SET lease_token=$2,leased_until=now()+interval '30 minutes',attempts=attempts+1 WHERE id=$1",
        [n.id, token],
      );
      result.push({
        id: String(n.id),
        token,
        number: n.phone,
        text: `📋 *Nova tarefa atribuída a você*\n*TAR-${n.task_id} · ${n.title}*\nOrigem: ${n.origin}\nEquipamento: ${n.equipment_name}\nAbra para acompanhar: ${origin}/tarefas?task=${n.task_id}`,
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
export async function acknowledgeNotification(id: unknown, token: unknown) {
  if (
    typeof id !== "string" ||
    !/^\d+$/.test(id) ||
    typeof token !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(token)
  )
    throw new TaskInputError("Confirmação inválida.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const result = await c.query(
      "UPDATE web_task_notifications SET state='sent',sent_at=COALESCE(sent_at,now()) WHERE id=$1 AND lease_token=$2 AND state IN('pending','sent') RETURNING id",
      [id, token],
    );
    if (!result.rowCount)
      throw new TaskConflict("Entrega já reclamada por outra execução.");
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
