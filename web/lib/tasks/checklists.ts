import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import { assertTaskAccess } from "./privacy";
import { TaskInputError, TaskConflict } from "./store";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function access(c: any, id: unknown, email: string, lock = false) {
  if (typeof id !== "string" || !/^\d{1,18}$/.test(id))
    throw new TaskInputError("Tarefa inválida.");
  const user = (
    await c.query("SELECT enabled FROM web_user_access WHERE email=$1", [email])
  ).rows[0];
  if (!user?.enabled) throw new Forbidden();
  if (
    !(
      await c.query(
        "SELECT id FROM web_tasks WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
        [id],
      )
    ).rows.length
  )
    throw new TaskInputError("Tarefa não encontrada.");
  await assertTaskAccess(id, email, c);
}
async function lists(c: any, taskId: string) {
  const rows = (
    await c.query(
      "SELECT id,title,created_at FROM web_task_checklists WHERE task_id=$1 ORDER BY created_at,id",
      [taskId],
    )
  ).rows;
  const items = (
    await c.query(
      "SELECT i.id,i.checklist_id,i.title,i.completed,i.version FROM web_task_checklist_items i JOIN web_task_checklists l ON l.id=i.checklist_id WHERE l.task_id=$1 ORDER BY i.completed,i.created_at,i.id",
      [taskId],
    )
  ).rows;
  return {
    lists: rows.map((l: any) => ({
      ...l,
      items: items.filter((i: any) => i.checklist_id === l.id),
    })),
  };
}
export async function taskChecklists(
  taskId: string,
  email: string,
  c: any = database(),
) {
  await access(c, taskId, email.toLowerCase());
  return lists(c, taskId);
}
export async function changeChecklist(b: any, email: string) {
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new TaskInputError("Dados inválidos.");
  email = email.toLowerCase();
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await access(c, b.taskId, email, true);
    if (!uuid.test(b.id || "")) throw new TaskInputError("Item inválido.");
    if (b.action === "create_list" || b.action === "add_item") {
      const max = b.action === "create_list" ? 160 : 500;
      if (
        typeof b.title !== "string" ||
        !b.title.trim() ||
        b.title.trim().length > max
      )
        throw new TaskInputError(
          `Preencha o título com até ${max} caracteres.`,
        );
      if (b.action === "create_list")
        await c.query(
          "INSERT INTO web_task_checklists(id,task_id,title,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
          [b.id, b.taskId, b.title.trim(), email],
        );
      else {
        if (
          !uuid.test(b.listId || "") ||
          !(
            await c.query(
              "SELECT id FROM web_task_checklists WHERE id=$1 AND task_id=$2",
              [b.listId, b.taskId],
            )
          ).rows.length
        )
          throw new TaskInputError("Lista não encontrada nesta tarefa.");
        await c.query(
          "INSERT INTO web_task_checklist_items(id,checklist_id,title,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
          [b.id, b.listId, b.title.trim(), email],
        );
      }
    } else if (b.action === "delete_list") {
      if (typeof b.previousTitle !== "string")
        throw new TaskInputError("Lista inválida.");
      const deleted = await c.query(
        "DELETE FROM web_task_checklists WHERE id=$1 AND task_id=$2 AND title=$3 RETURNING id",
        [b.id, b.taskId, b.previousTitle],
      );
      if (!deleted.rows.length)
        throw new TaskConflict("A lista foi alterada. Atualize a lista e tente novamente.");
    } else if (b.action === "rename_list") {
      if (typeof b.title !== "string" || !b.title.trim() || b.title.trim().length > 160 ||
          typeof b.previousTitle !== "string")
        throw new TaskInputError("Preencha o título com até 160 caracteres.");
      const changed = await c.query(
        "UPDATE web_task_checklists SET title=$3 WHERE id=$1 AND task_id=$2 AND title=$4 RETURNING id",
        [b.id, b.taskId, b.title.trim(), b.previousTitle],
      );
      if (!changed.rows.length)
        throw new TaskConflict("A lista foi alterada. Atualize a lista e tente novamente.");
    } else if (b.action === "edit_item" || b.action === "delete_item") {
      if (!Number.isInteger(b.version) || b.version < 1)
        throw new TaskInputError("Item inválido.");
      if (b.action === "edit_item" && (typeof b.title !== "string" || !b.title.trim() || b.title.trim().length > 500))
        throw new TaskInputError("Preencha o título com até 500 caracteres.");
      const changed = b.action === "edit_item"
        ? await c.query(
            "UPDATE web_task_checklist_items i SET title=$4,version=version+1 FROM web_task_checklists l WHERE i.id=$1 AND i.checklist_id=l.id AND l.task_id=$2 AND i.version=$3 RETURNING i.id",
            [b.id, b.taskId, b.version, b.title.trim()],
          )
        : await c.query(
            "DELETE FROM web_task_checklist_items i USING web_task_checklists l WHERE i.id=$1 AND i.checklist_id=l.id AND l.task_id=$2 AND i.version=$3 RETURNING i.id",
            [b.id, b.taskId, b.version],
          );
      if (!changed.rows.length)
        throw new TaskConflict("O item foi alterado. Atualize a lista e tente novamente.");
    } else if (b.action === "toggle") {
      if (
        typeof b.completed !== "boolean" ||
        !Number.isInteger(b.version) ||
        b.version < 1
      )
        throw new TaskInputError("Item inválido.");
      const updated = await c.query(
        `UPDATE web_task_checklist_items i SET completed=$3,completed_by=CASE WHEN $3 THEN $4 ELSE NULL END,completed_at=CASE WHEN $3 THEN now() ELSE NULL END,version=version+1 FROM web_task_checklists l WHERE i.id=$1 AND i.checklist_id=l.id AND l.task_id=$2 AND i.version=$5 RETURNING i.id`,
        [b.id, b.taskId, b.completed, email, b.version],
      );
      if (!updated.rows.length)
        throw new TaskConflict(
          "O item foi alterado. Atualize a lista e tente novamente.",
        );
    } else throw new TaskInputError("Ação inválida.");
    const result = await lists(c, b.taskId);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
