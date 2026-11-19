import "server-only";
import type { PoolClient } from "pg";
import { taskColumn } from "./kanban";
import { database } from "../db";
import { Forbidden } from "../auth";
export async function taskAdministrator(email?: string, db: Pick<PoolClient, "query"> = database()) {
  if (!email) return false;
  const row = (await db.query("SELECT role,enabled FROM web_user_access WHERE email=$1", [email.toLowerCase()])).rows[0];
  return !!row?.enabled && row.role === "admin";
}
export function taskParticipant(task: {assigned_to?: string | null; followers?: string[] | null}, email?: string) {
  const key = email?.trim().toLowerCase();
  return !!key && (task.assigned_to?.trim().toLowerCase() === key || (task.followers || []).some(value => value.trim().toLowerCase() === key));
}
export function canViewTask(task: {restricted?: boolean | string; assigned_to?: string | null; followers?: string[] | null}, email?: string, administrator = false) {
  return !(task.restricted === true || task.restricted === "true") || administrator || taskParticipant(task,email);
}
export async function assertTaskAccess(id: string, email?: string, db: Pick<PoolClient, "query"> = database()) {
  const task = (await db.query("SELECT restricted,assigned_to,followers FROM web_tasks WHERE id=$1", [id])).rows[0];
  if (task && !canViewTask(task,email,await taskAdministrator(email, db))) throw new Forbidden();
}
export function restrictedTaskSummary(task: any) {
  return { id: task.id, restricted: true, redacted: true, title: "Tarefa restrita", status: task.status,
    kanban_column: taskColumn(task), source_key: "manual:restricted", priority: "normal",
    due_date: null, assigned_to: null, assignee_name: task.assignee_name || null, origin: "Tarefa restrita", equipment_name: "", customer: "" };
}
