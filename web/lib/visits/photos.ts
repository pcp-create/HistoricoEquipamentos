import "server-only";
import { database } from "../db";
import { visitIdentity } from "./store";
import { userModules } from "../user-modules";
import { hasModuleAccess } from "../module-sections";
import { Forbidden } from "../auth";
import { canViewTask, taskAdministrator } from "../tasks/privacy";

export async function getVisitPhoto(id: string, email: string, db: any = database()) {
  email = email.toLowerCase();
  const user = await visitIdentity(db, email), modules = userModules(user);
  if (!hasModuleAccess(modules, 'visitas') && !hasModuleAccess(modules, 'gestao-visitas')) {
    if (!hasModuleAccess(modules, 'tarefas')) throw new Forbidden();
    const tasks = (await db.query(
      "SELECT DISTINCT t.restricted,t.assigned_to,t.followers FROM web_task_notes n JOIN web_tasks t ON t.id=n.task_id WHERE position($1 in n.description)>0",
      [`/api/visits/photos/${id}`],
    )).rows;
    const admin = await taskAdministrator(email, db);
    if (!tasks.some((task:any) => canViewTask(task, email, admin))) throw new Forbidden();
  }
  return (await db.query(
    "SELECT p.content FROM web_visit_photos p JOIN web_sales_visits v ON v.id=p.visit_id WHERE p.id=$1",
    [id],
  )).rows[0] || null;
}
