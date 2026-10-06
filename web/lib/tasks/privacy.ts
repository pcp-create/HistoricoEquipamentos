import "server-only";
import { taskColumn } from "./kanban";
import { database } from "../db";
import { Forbidden } from "../auth";
export async function taskAdministrator(email?: string, db = database()) {
  if (!email) return false;
  const row = (await db.query("SELECT role,enabled FROM web_user_access WHERE email=$1", [email.toLowerCase()])).rows[0];
  return !!row?.enabled && row.role === "admin";
}
export async function assertTaskAccess(id: string, email?: string) {
  const task = (await database().query("SELECT to_jsonb(t)->>'restricted' restricted FROM web_tasks t WHERE id=$1", [id])).rows[0];
  if (task?.restricted === "true" && !(await taskAdministrator(email))) throw new Forbidden();
}
export function restrictedTaskSummary(task: any) {
  return { id: task.id, restricted: true, redacted: true, title: "Tarefa restrita", status: task.status,
    kanban_column: taskColumn(task), source_key: "manual:restricted", priority: "normal",
    due_date: null, assigned_to: null, assignee_name: task.assignee_name || null, origin: "Tarefa restrita", equipment_name: "", customer: "" };
}
