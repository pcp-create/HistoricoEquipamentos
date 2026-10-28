import "server-only";
import { brazilDay } from "./model";
import { saveReminder } from "../tasks/reminders";

// Called inside the visit transaction. The visit lock serializes creation and completion.
export async function syncVisitTask(
  c: any,
  visitId: string,
  actor: string,
  create = false,
  when?: unknown,
  deleted = false,
) {
  const visit = (
    await c.query("SELECT * FROM web_sales_visits WHERE id=$1 FOR UPDATE", [
      visitId,
    ])
  ).rows[0];
  if (!visit) return;
  const source = `visit:${visitId}`;
  let task = (
    await c.query(
      "SELECT * FROM web_tasks WHERE source_key=$1 ORDER BY id LIMIT 1 FOR UPDATE",
      [source],
    )
  ).rows[0];
  if (!task && !create) return;
  const customer =
    (
      await c.query(
        `SELECT name FROM web_sales_leads WHERE 'lead:'||id::text=$1 UNION ALL SELECT name FROM m8_customer_directory WHERE 'm8:'||person_id::text=$1 LIMIT 1`,
        [visit.customer_key],
      )
    ).rows[0]?.name || visit.customer_key;
  const due = brazilDay(visit.scheduled_at);
  if (!task) {
    task = (
      await c.query(
        `INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,customer,source_status,priority,assigned_to,due_date,first_assigned_at,created_by,updated_by,followers)
   VALUES($1,'visit','Visita comercial','Realizar visita — '||$2,'Visita comercial',$2,'scheduled','normal',$3,$4,now(),'Sistema','Sistema',ARRAY[$5::text]) RETURNING *`,
        [source, customer, visit.seller, due, actor],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO web_sales_visit_tasks(request_id,visit_id,task_id,created_by) VALUES($1,$1,$2,$3)",
      [visitId, task.id, actor],
    );
    await c.query(
      "UPDATE web_sales_visits SET followers=ARRAY(SELECT DISTINCT unnest(followers||ARRAY[$2::text])) WHERE id=$1",
      [visitId, actor],
    );
    await c.query(
      "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Tarefa automática de visita criada',$2,true,'Sistema','Sistema')",
      [
        task.id,
        `Visita criada por ${actor}. Responsável: ${visit.seller}. Agendada para ${new Date(visit.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.\nContato: ${visit.contact} · ${visit.phone}\n${visit.description}`,
      ],
    );
    // Direct visit records are already completed; only queue their completion notice.
    if (visit.status === "scheduled") await c.query(
      "INSERT INTO web_task_notifications(task_id,task_version,recipient) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [task.id, task.version, visit.seller],
    );
  }
  const finished = deleted || visit.status !== "scheduled";
  if (finished && task.status !== "completed") {
    await c.query(
      "UPDATE web_tasks SET status='completed',source_resolved=true,source_status=$2,completed_at=COALESCE($3::timestamptz,now()),updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=$1",
      [task.id, deleted ? "deleted" : visit.status, visit.completed_at],
    );
    await c.query(
      "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Tarefa encerrada automaticamente',$2,true,'Sistema','Sistema')",
      [
        task.id,
        deleted
          ? `Visita excluída por ${actor}.`
          : visit.status === "cancelled"
            ? `Visita cancelada por ${actor}.`
            : `Realização da visita registrada por ${actor}.\n${visit.outcome}`,
      ],
    );
  } else if (!finished && task.status !== "completed") {
    if (
      (task.due_date instanceof Date
        ? task.due_date.toISOString().slice(0, 10)
        : String(task.due_date).slice(0, 10)) !== due ||
      task.customer !== customer
    ) {
      await c.query(
        "UPDATE web_tasks SET due_date=$2,customer=$3,title='Realizar visita — '||$3,updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=$1",
        [task.id, due, customer],
      );
    }
    if (when)
      await saveReminder(
        { action: "create", taskId: String(task.id), when },
        actor,
        c,
      );
  }
  if (finished) {
    await c.query(
      "UPDATE web_task_reminder_series SET active=false WHERE task_id=$1",
      [task.id],
    );
    await c.query(
      "UPDATE web_task_reminders SET state='cancelled' WHERE task_id=$1 AND state='pending'",
      [task.id],
    );
    await c.query(
      "UPDATE web_sales_visit_alerts SET state='cancelled' WHERE visit_id=$1 AND state='pending'",
      [visitId],
    );
  }
  return String(task.id);
}
