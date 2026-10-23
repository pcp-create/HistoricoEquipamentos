import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import type { AuthUser } from "../user-display-name";
import { AdminInputError } from "../admin-store";
import { createTask } from "../tasks/store";
export async function createVisitTask(b: any, user: AuthUser) {
  if (
    !/^[0-9a-f-]{36}$/i.test(b.visitId || "") ||
    !/^[0-9a-f-]{36}$/i.test(b.requestId || "")
  )
    throw new AdminInputError("Visita inválida.");
  if (!b.assignedTo || !b.dueDate)
    throw new AdminInputError("Informe responsável e vencimento.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const v = (
        await c.query("SELECT * FROM web_sales_visits WHERE id=$1 FOR UPDATE", [
          b.visitId,
        ])
      ).rows[0],
      access = (
        await c.query(
          "SELECT enabled,role FROM web_user_access WHERE email=$1",
          [user.email],
        )
      ).rows[0];
    if (
      !access?.enabled ||
      !v ||
      (v.seller !== user.email && access.role !== "admin")
    )
      throw new Forbidden();
    if (v.status === "cancelled")
      throw new AdminInputError(
        "Não é possível criar uma tarefa para uma visita cancelada.",
      );
    const old = (
      await c.query(
        "SELECT task_id FROM web_sales_visit_tasks WHERE request_id=$1 AND visit_id=$2",
        [b.requestId, b.visitId],
      )
    ).rows[0];
    if (old) {
      await c.query("COMMIT");
      return { taskId: String(old.task_id) };
    }
    const task = await createTask(b, user, c);
    const id = String(task.task.id);
    await c.query(
      "UPDATE web_tasks SET origin='Visita comercial' WHERE id=$1",
      [id],
    );
    await c.query(
      "INSERT INTO web_sales_visit_tasks(request_id,visit_id,task_id,created_by) VALUES($1,$2,$3,$4)",
      [b.requestId, b.visitId, id, user.email],
    );
    await c.query(
      "UPDATE web_sales_visits SET followers=ARRAY(SELECT DISTINCT unnest(followers||ARRAY[$2::text])) WHERE id=$1",
      [b.visitId, user.email],
    );
    await c.query("COMMIT");
    return { taskId: id };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
