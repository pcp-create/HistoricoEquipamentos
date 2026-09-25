import { creationContext, TaskContextError } from "./creation-context";
import { assignNewTasks } from "./territories";
import { randomUUID } from "node:crypto";
import { taskColumn, taskColumns } from "./kanban";
import {
  allowedTaskAttachment,
  taskAttachmentTypeMessage,
} from "./attachment-types";
import "server-only";
import { database } from "../db";
import { taskSources, type TaskSource } from "./sources";
import { userDisplayName, type AuthUser } from "../user-display-name";
import type { PoolClient } from "pg";
export class TaskInputError extends Error {}
export class TaskConflict extends Error {}
export const statusLabel = (s: string) =>
  ({
    soon: "Próximo do vencimento",
    overdue: "Vencido",
    due: "Venceu / vence hoje",
    scheduled: "Em dia",
    current: "Em dia",
    incomplete: "Dados incompletos",
  })[s] || s;
const idValue = (v: unknown) => {
  if (typeof v !== "string" || !/^\d{1,18}$/.test(v))
    throw new TaskInputError("Tarefa inválida.");
  return v;
};
function assignmentReason(body: any): string {
  if (
    typeof body.assignmentReason !== "string" ||
    !body.assignmentReason.trim() ||
    body.assignmentReason.trim().length > 2000
  )
    throw new TaskInputError(
      "Informe a justificativa da mudança de responsável (até 2.000 caracteres).",
    );
  return body.assignmentReason.trim();
}
async function note(
  c: PoolClient,
  id: string,
  title: string,
  description: string,
  actor?: AuthUser,
) {
  await c.query(
    "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id,
      title,
      description,
      !actor,
      actor?.email || "Sistema",
      actor ? userDisplayName(actor) : "Sistema",
    ],
  );
}
async function interventionAttribution(
  db: Pick<PoolClient, "query">,
  task: any,
  until: string | Date,
): Promise<string> {
  if (!task.plan_id) return "";
  const event = (
    await db.query(
      `SELECT e.created_at,e.created_by,e.display_name,u.display_name user_name
    FROM web_equipment_events e LEFT JOIN web_user_access u ON u.email=e.created_by
    WHERE e.plan_id::text=$1 AND e.equipment_id=$2 AND e.created_at >= $4 AND e.created_at <= $5
      AND jsonb_build_array(e.document->'before'->'lastDate',e.document->'before'->'lastOrder',e.document->'before'->'lastMeter')=$3::jsonb
      AND jsonb_build_array(e.document->'after'->'lastDate',e.document->'after'->'lastOrder',e.document->'after'->'lastMeter') IS DISTINCT FROM $3::jsonb
    ORDER BY e.created_at,e.id LIMIT 1`,
      [task.plan_id, task.equipment_id, task.cycle, task.created_at, until],
    )
  ).rows[0];
  if (!event)
    return " Autoria da alteração não identificada no histórico disponível.";
  const name =
    event.user_name ||
    (event.display_name?.includes("@") ? null : event.display_name) ||
    "Usuário não identificado";
  const date = new Date(event.created_at).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  return ` Alteração registrada por: ${name}, em ${date} (Brasília).`;
}
export async function syncTasks(
  provider: () => Promise<TaskSource[]> = taskSources,
  options: {
    client?: PoolClient;
    silent?: boolean;
    preventiveOnly?: boolean;
  } = {},
) {
  const c = options.client || (await database().connect());
  try {
    if (!options.client) await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(81021,1)");
    // Read the complete source snapshot inside the synchronization lock. A failed read never closes tasks.
    const sources = await provider(),
      byKey = new Map(sources.map((s) => [s.key, s]));
    if (byKey.size !== sources.length) throw Error("Duplicate task source");
    const open = (
      await c.query(
        "SELECT * FROM web_tasks WHERE status<>'completed' AND (NOT $1::boolean OR source_key LIKE 'preventive%') FOR UPDATE",
        [!!options.preventiveOnly],
      )
    ).rows;
    let created = 0,
      completed = 0;
    const active = new Set<string>();
    const closed = (
      await c.query(
        "SELECT * FROM web_tasks WHERE status='completed' AND NOT source_resolved AND (NOT $1::boolean OR source_key LIKE 'preventive%') FOR UPDATE",
        [!!options.preventiveOnly],
      )
    ).rows;
    for (const t of closed) {
      if (t.source_key.startsWith("manual:")) continue;
      const source = byKey.get(t.source_key);
      if (!source || source.resolved || source.cycle !== t.cycle) {
        await c.query("UPDATE web_tasks SET source_resolved=true WHERE id=$1", [
          t.id,
        ]);
      } else active.add(t.source_key);
    }
    for (const t of open) {
      if (t.source_key.startsWith("manual:")) continue;
      const source = byKey.get(t.source_key);
      if (!source || source.resolved || source.cycle !== t.cycle) {
        let reason = !source
          ? "Processo encerrado, substituído ou removido da base ativa."
          : source.cycle !== t.cycle
            ? "Nova intervenção registrada no plano preventivo."
            : `Processo atualizado: ${statusLabel(t.source_status)} → ${statusLabel(source.state)}.`;
        if (source && source.cycle !== t.cycle)
          reason += await interventionAttribution(c, t, new Date());
        await c.query(
          "UPDATE web_tasks SET status='completed',source_resolved=true,completed_at=now(),updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=$1",
          [t.id],
        );
        await note(c, t.id, "Tarefa concluída automaticamente", reason);
        completed++;
        continue;
      }
      active.add(t.source_key);
      const due = source.due,
        oldDue = t.due_date
          ? String(
              t.due_date instanceof Date
                ? t.due_date.toISOString().slice(0, 10)
                : t.due_date,
            )
          : null;
      if (
        t.source_status !== source.state ||
        oldDue !== due ||
        t.origin !== source.origin ||
        t.customer !== source.customer ||
        t.plan_id !== source.plan ||
        t.title !== source.title ||
        t.equipment_name !== source.name ||
        (!t.priority_manual && t.priority !== source.priority)
      ) {
        await c.query(
          "UPDATE web_tasks SET source_status=$2,due_date=$3,priority=CASE WHEN priority_manual THEN priority ELSE $4 END,origin=$5,customer=$6,title=$7,equipment_name=$8,plan_id=$9,updated_at=now(),updated_by='Sistema',version=version+1 WHERE id=$1",
          [
            t.id,
            source.state,
            due,
            source.priority,
            source.origin,
            source.customer,
            source.title,
            source.name,
            source.plan,
          ],
        );
        await note(
          c,
          t.id,
          "Processo atualizado",
          `${statusLabel(t.source_status)} → ${statusLabel(source.state)}. Vencimento: ${due || "não informado"}. ${!source.alert ? "Aguardando dados suficientes para confirmar a regularização." : ""}`,
        );
      }
    }
    const pending = sources.filter((s) => s.alert && !active.has(s.key));
    if (pending.length) {
      const inserted = (
        await c.query(
          `INSERT INTO web_tasks(source_key,cycle,equipment_id,plan_id,origin,title,equipment_name,customer,source_status,priority,due_date)
        SELECT x.key,x.cycle,x.equipment::bigint,x.plan,x.origin,x.title,x.name,x.customer,x.state,x.priority,x.due::date FROM jsonb_to_recordset($1::jsonb) AS x(key text,cycle text,equipment text,plan text,origin text,title text,name text,customer text,state text,priority text,due text) RETURNING id,source_key`,
          [JSON.stringify(pending)],
        )
      ).rows;
      const notes = inserted.map((t) => {
        const s = byKey.get(t.source_key)!;
        return {
          id: String(t.id),
          description: `${s.origin}: ${statusLabel(s.state)}. Vencimento: ${s.due || "não informado"}. Aguardando atribuição.`,
        };
      });
      await c.query(
        `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) SELECT x.id::bigint,'Alerta identificado',x.description,true,'Sistema','Sistema' FROM jsonb_to_recordset($1::jsonb) AS x(id text,description text)`,
        [JSON.stringify(notes)],
      );
      await assignNewTasks(
        c,
        inserted.map((t) => String(t.id)),
      );
      if (options.silent)
        await c.query(
          "UPDATE web_task_notifications SET state='skipped' WHERE task_id=ANY($1::bigint[]) AND state='pending'",
          [inserted.map((t) => String(t.id))],
        );
      created = inserted.length;
    }
    await c.query(
      "INSERT INTO web_task_sync(id,synced_at) VALUES(1,now()) ON CONFLICT(id) DO UPDATE SET synced_at=now()",
    );
    if (!options.client) await c.query("COMMIT");
    return { created, completed };
  } catch (e) {
    if (!options.client) await c.query("ROLLBACK");
    throw e;
  } finally {
    if (!options.client) c.release();
  }
}
export async function listTasks(p: URLSearchParams, user: AuthUser) {
  const equipment = p.get("equipment");
  if (equipment) idValue(equipment);
  const rows = (
    await database().query(
      `SELECT t.*,u.display_name assignee_name,to_jsonb(u)->>'task_color' assignee_color,m.display_name modifier_name,u.enabled assignee_enabled FROM web_tasks t LEFT JOIN web_user_access u ON u.email=t.assigned_to LEFT JOIN web_user_access m ON m.email=t.updated_by WHERE ($1::text IS NULL OR t.assigned_to=$1) AND ($2::bigint IS NULL OR t.equipment_id=$2) ORDER BY t.created_at DESC,t.id DESC`,
      [p.get("mine") === "true" ? user.email.toLowerCase() : null, equipment],
    )
  ).rows;
  const users = (
    await database().query(
      "SELECT email,display_name,phone,to_jsonb(web_user_access)->>'task_color' task_color FROM web_user_access WHERE enabled ORDER BY COALESCE(display_name,email),email",
    )
  ).rows;
  const sync = (
    await database().query("SELECT synced_at FROM web_task_sync WHERE id=1")
  ).rows[0];
  return {
    tasks: rows,
    users,
    email: user.email,
    syncedAt: sync?.synced_at || null,
  };
}
export async function taskDetail(id: string) {
  idValue(id);
  const db = database();
  const task = (
    await db.query(
      "SELECT t.*,u.display_name assignee_name,to_jsonb(u)->>'task_color' assignee_color,m.display_name modifier_name FROM web_tasks t LEFT JOIN web_user_access u ON u.email=t.assigned_to LEFT JOIN web_user_access m ON m.email=t.updated_by WHERE t.id=$1",
      [id],
    )
  ).rows[0];
  if (!task) throw new TaskInputError("Tarefa não encontrada.");
  const notes = (
    await db.query(
      "SELECT * FROM web_task_notes WHERE task_id=$1 ORDER BY created_at DESC,id DESC",
      [id],
    )
  ).rows;
  for (const n of notes) {
    if (
      n.automatic &&
      n.title === "Tarefa concluída automaticamente" &&
      n.description === "Nova intervenção registrada no plano preventivo."
    ) {
      n.description += await interventionAttribution(db, task, n.created_at);
    }
  }
  const attachments = (
    await db.query(
      "SELECT id,filename,octet_length(content) size,created_by,created_name,created_at FROM web_task_attachments WHERE task_id=$1 ORDER BY created_at DESC,id DESC",
      [id],
    )
  ).rows;
  const notifications = (
    await db.query(
      "SELECT n.id,n.recipient,u.display_name recipient_name,n.state,n.attempts,n.created_at,n.sent_at FROM web_task_notifications n LEFT JOIN web_user_access u ON u.email=n.recipient WHERE n.task_id=$1 ORDER BY n.id DESC",
      [id],
    )
  ).rows;
  // Resolve legacy assignment notes without rewriting the audit record or
  // replacing emails in notes written freely by users.
  const people = (
    await db.query("SELECT email,display_name FROM web_user_access")
  ).rows;
  const names = new Map<string, string>(
    people.map((p) => [
      p.email.trim().toLowerCase(),
      p.display_name?.trim() || "Funcionário sem nome cadastrado",
    ]),
  );
  task.creator_name =
    task.created_by === "Sistema"
      ? "Sistema"
      : names.get(task.created_by?.toLowerCase()) ||
        "Usuário sem nome cadastrado";
  for (const item of [...notes, ...attachments]) {
    const name = names.get(item.created_by?.trim().toLowerCase());
    if (name) item.created_name = name;
    else if (item.created_name?.includes("@"))
      item.created_name = "Usuário sem nome cadastrado";
  }
  for (const n of notes) {
    if (n.title !== "Responsável / prioridade atualizados") continue;
    n.description = n.description.replace(
      /^(Atribuído a: )([^\s@]+@[^\s@]+)(\. Prioridade: )/,
      (_match: string, prefix: string, email: string, suffix: string) =>
        prefix +
        (names.get(email.toLowerCase()) || "Funcionário sem nome cadastrado") +
        suffix,
    );
  }
  return { task, notes, attachments, notifications };
}
export async function updateTask(body: any, user: AuthUser) {
  const id = idValue(body?.id);
  if (!Number.isInteger(body.version) || body.version < 1)
    throw new TaskInputError("Versão inválida.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    if (body.action === "move")
      await c.query("SELECT pg_advisory_xact_lock(81021,1)");
    const t = (
      await c.query("SELECT * FROM web_tasks WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!t) throw new TaskInputError("Tarefa não encontrada.");
    if (t.version !== body.version)
      throw new TaskConflict(
        "A tarefa foi atualizada. Recarregue antes de salvar.",
      );
    if (body.action === "reopen") {
      if (!t.source_key.startsWith("manual:") || t.status !== "completed")
        throw new TaskInputError(
          "Somente tarefas manuais concluídas podem ser reabertas.",
        );
      await c.query(
        "UPDATE web_tasks SET status='not_started',kanban_column=NULL,completed_at=NULL,source_resolved=false WHERE id=$1",
        [id],
      );
      await note(
        c,
        id,
        "Tarefa reaberta",
        "Tarefa manual reaberta como pendente. Responsável e prazo mantidos.",
        user,
      );
    } else if (body.action === "note") {
      if (
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 160 ||
        typeof body.description !== "string" ||
        !body.description.trim() ||
        body.description.length > 12000
      )
        throw new TaskInputError(
          "Informe título (até 160 caracteres) e descrição (até 12.000).",
        );
      await note(c, id, body.title.trim(), body.description.trim(), user);
    } else if (body.action === "move") {
      if (t.status === "completed")
        throw new TaskInputError("Tarefas concluídas não podem ser reabertas.");
      if (
        typeof body.column !== "string" ||
        !Object.hasOwn(taskColumns, body.column)
      )
        throw new TaskInputError("Coluna inválida.");
      if (body.column === "completed" && !t.source_key.startsWith("manual:"))
        throw new TaskInputError(
          "Tarefas de alertas são concluídas automaticamente após a resolução da pendência de origem.",
        );
      if (body.column === "in_progress") {
        const actorEmail = user.email.trim().toLowerCase();
        if (
          t.assigned_to &&
          t.assigned_to !== actorEmail &&
          !["keep", "self"].includes(body.assignment)
        )
          throw new TaskInputError(
            "Escolha manter o responsável atual ou assumir a tarefa.",
          );
        if (
          !t.assigned_to ||
          (body.assignment === "self" && t.assigned_to !== actorEmail)
        ) {
          const reason = assignmentReason(body);
          const actor = (
            await c.query(
              "SELECT enabled,phone,display_name FROM web_user_access WHERE email=$1 FOR SHARE",
              [actorEmail],
            )
          ).rows[0];
          if (!actor?.enabled)
            throw new TaskInputError(
              "Seu cadastro deve estar ativo para assumir a tarefa.",
            );
          if (!actor.phone)
            throw new TaskInputError(
              "Cadastre seu WhatsApp antes de assumir a tarefa.",
            );
          await c.query(
            "UPDATE web_tasks SET assigned_to=$2,first_assigned_at=COALESCE(first_assigned_at,now()) WHERE id=$1",
            [id, actorEmail],
          );
          await note(
            c,
            id,
            "Responsável alterado",
            `Atribuído a: ${actor.display_name || "Funcionário sem nome cadastrado"}. Atribuição ao iniciar pelo Kanban. Justificativa: ${reason}`,
            user,
          );
          await c.query(
            "INSERT INTO web_task_notifications(task_id,task_version,recipient,assignment_reason) VALUES($1,$2,$3,$4)",
            [id, t.version + 1, actorEmail, reason],
          );
        }
      }
      const completed = body.column === "completed";
      await c.query(
        `UPDATE web_tasks SET status=$2,kanban_column=$3,completed_at=CASE WHEN $2='completed' THEN now() ELSE NULL END,source_resolved=false WHERE id=$1`,
        [
          id,
          completed
            ? "completed"
            : body.column === "pending"
              ? "not_started"
              : body.column === "in_progress"
                ? "in_progress"
                : t.status,
          completed ? null : body.column,
        ],
      );
      await note(
        c,
        id,
        "Status de execução alterado",
        `${taskColumns[taskColumn(t)]} → ${taskColumns[body.column as keyof typeof taskColumns]}.${completed ? " Tarefa manual concluída." : ""}`,
        user,
      );
    } else if (body.action === "update") {
      if (t.status === "completed")
        throw new TaskInputError(
          "Tarefas concluídas não são reabertas nem reatribuídas.",
        );
      if (
        !["normal", "high", "urgent"].includes(body.priority) ||
        typeof body.assignedTo !== "string" ||
        typeof body.automaticPriority !== "boolean"
      )
        throw new TaskInputError("Confira responsável e prioridade.");
      const assigned = body.assignedTo.trim().toLowerCase() || null;
      let assignedName = "Não atribuído";
      if (assigned) {
        const u = (
          await c.query(
            "SELECT enabled,phone,display_name FROM web_user_access WHERE email=$1 FOR SHARE",
            [assigned],
          )
        ).rows[0];
        if (!u?.enabled)
          throw new TaskInputError("Escolha um funcionário ativo.");
        assignedName = u.display_name || "Funcionário sem nome cadastrado";
        if (assigned !== t.assigned_to && !u.phone)
          throw new TaskInputError(
            "Cadastre o WhatsApp do funcionário antes de atribuir a tarefa.",
          );
      }
      const changed = assigned !== t.assigned_to;
      const reason = changed ? assignmentReason(body) : null;
      await c.query(
        "UPDATE web_tasks SET assigned_to=$2,kanban_column=CASE WHEN assigned_to IS DISTINCT FROM $2 THEN NULL ELSE kanban_column END,status=CASE WHEN assigned_to IS NOT DISTINCT FROM $2 THEN status WHEN $2::text IS NULL THEN 'not_started' ELSE 'in_progress' END,first_assigned_at=CASE WHEN $2::text IS NOT NULL THEN COALESCE(first_assigned_at,now()) ELSE first_assigned_at END,priority=$3,priority_manual=$4 WHERE id=$1",
        [id, assigned, body.priority, !body.automaticPriority],
      );
      await note(
        c,
        id,
        "Responsável / prioridade atualizados",
        `Atribuído a: ${assignedName}. Prioridade: ${{ normal: "Normal", high: "Alta", urgent: "Urgente" }[body.priority as string]}.${reason ? ` Justificativa: ${reason}` : ""}`,
        user,
      );
      if (changed && assigned)
        await c.query(
          "INSERT INTO web_task_notifications(task_id,task_version,recipient,assignment_reason) VALUES($1,$2,$3,$4)",
          [id, t.version + 1, assigned, reason],
        );
    } else throw new TaskInputError("Operação inválida.");
    await c.query(
      "UPDATE web_tasks SET updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1",
      [id, user.email],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return taskDetail(id);
}
export async function attachTask(id: string, file: File, user: AuthUser) {
  idValue(id);
  if (file.size < 1 || file.size > 3000000)
    throw new TaskInputError("Envie um arquivo de até 3 MB.");
  if (!allowedTaskAttachment(file.name))
    throw new TaskInputError(taskAttachmentTypeMessage);
  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_") || "anexo";
  if (filename.length > 180)
    throw new TaskInputError("O nome do arquivo deve ter até 180 caracteres.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const t = (
      await c.query("SELECT id FROM web_tasks WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!t) throw new TaskInputError("Tarefa não encontrada.");
    const count = Number(
      (
        await c.query(
          "SELECT count(*) n FROM web_task_attachments WHERE task_id=$1",
          [id],
        )
      ).rows[0].n,
    );
    if (count >= 20)
      throw new TaskInputError("Limite de 20 anexos por tarefa.");
    await c.query(
      "INSERT INTO web_task_attachments(task_id,filename,content_type,content,created_by,created_name) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        filename,
        "application/octet-stream",
        bytes,
        user.email,
        userDisplayName(user),
      ],
    );
    await note(c, id, "Anexo incluído", filename, user);
    await c.query(
      "UPDATE web_tasks SET updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1",
      [id, user.email],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return taskDetail(id);
}

export async function createTask(body: any, user: AuthUser) {
  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.length > 160 ||
    typeof body.description !== "string" ||
    body.description.length > 12000 ||
    !["normal", "high", "urgent"].includes(body.priority) ||
    typeof body.assignedTo !== "string" ||
    typeof body.dueDate !== "string"
  )
    throw new TaskInputError(
      "Confira título, descrição, responsável e prioridade.",
    );
  const due = body.dueDate || null;
  if (
    due &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
      !Number.isFinite(Date.parse(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due)
  )
    throw new TaskInputError("Data de vencimento inválida.");
  const assigned = body.assignedTo.trim().toLowerCase() || null;
  const c = await database().connect();
  let id: string;
  try {
    await c.query("BEGIN READ WRITE");
    const context = await creationContext(c, body);
    if (assigned) {
      const employee = (
        await c.query(
          "SELECT enabled,phone FROM web_user_access WHERE email=$1 FOR SHARE",
          [assigned],
        )
      ).rows[0];
      if (!employee?.enabled)
        throw new TaskInputError("Escolha um funcionário ativo.");
      if (!employee.phone)
        throw new TaskInputError(
          "Cadastre o WhatsApp do funcionário antes de atribuir a tarefa.",
        );
    }
    id = String(
      (
        await c.query(
          `INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,source_status,priority,priority_manual,assigned_to,due_date,first_assigned_at,created_by,updated_by,order_company,order_id,order_number,equipment_id,customer)
      VALUES($1,'manual',$7,$2,$8,'manual',$3,true,$4,$5,CASE WHEN $4::text IS NOT NULL THEN now() END,$6,$6,$9,$10,$11,$12,$13) RETURNING id`,
          [
            "manual:" + randomUUID(),
            body.title.trim(),
            body.priority,
            assigned,
            due,
            user.email,
            context.order
              ? "Ordem de Serviço"
              : context.equipment
                ? "Equipamento"
                : "Tarefa manual",
            context.equipmentName,
            context.order?.company_id ?? null,
            context.order?.id ?? null,
            context.order?.number ?? null,
            context.equipment?.id ?? null,
            context.customer,
          ],
        )
      ).rows[0].id,
    );
    await note(
      c,
      id,
      "Tarefa manual criada",
      (body.description.trim() || "Tarefa cadastrada manualmente.") +
        (context.order
          ? `\nVinculada à OS ${context.order.number}, empresa ${context.order.company_id}.`
          : ""),
      user,
    );
    if (assigned)
      await c.query(
        "INSERT INTO web_task_notifications(task_id,task_version,recipient) VALUES($1,1,$2)",
        [id, assigned],
      );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    if (e instanceof TaskContextError) throw new TaskInputError(e.message);
    throw e;
  } finally {
    c.release();
  }
  return taskDetail(id!);
}
