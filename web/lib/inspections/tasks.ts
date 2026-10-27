import "server-only";
import { database } from "../db";
import { inspectionRows } from "./store";
import type { TaskSource } from "../tasks/sources";
export async function inspectionSources(
  c: any = database(),
): Promise<TaskSource[]> {
  if (
    !(
      await c.query(
        "SELECT to_regclass('public.web_inspection_plans') AS relation",
      )
    ).rows[0]?.relation
  )
    return [];
  return (await inspectionRows(c)).map((p: any) => ({
    key: "inspection:" + p.id,
    cycle: p.forecast.lastDate || "initial",
    equipment: null,
    plan: p.id,
    origin: "Inspeção de Cliente",
    title: p.type_name,
    name: "Parque de máquinas do cliente",
    customer: p.customer,
    state: p.forecast.status,
    alert: p.active && ["soon", "due", "overdue"].includes(p.forecast.status),
    resolved: !p.active || p.forecast.status === "scheduled",
    priority: ["due", "overdue"].includes(p.forecast.status)
      ? "urgent"
      : "normal",
    due: p.forecast.due,
  }));
}
export async function assignInspectionTasks(
  c: any,
  ids: string[],
  rules: any[],
) {
  if (!ids.length || !rules.length) return;
  if (
    !(
      await c.query(
        "SELECT to_regclass('public.web_inspection_plans') AS relation",
      )
    ).rows[0]?.relation
  )
    return;
  const { cityKey } = await import("../tasks/territories");
  const rows = (
    await c.query(
      `SELECT t.id::text,d.payload->>'municipioNome' city,d.payload->>'ufSigla' uf FROM web_tasks t JOIN web_inspection_plans p ON p.id::text=t.plan_id LEFT JOIN LATERAL(SELECT payload FROM m8_customer_directory WHERE person_id=p.customer_person_id ORDER BY (company_id=p.customer_company_id) DESC,collected_at DESC LIMIT 1)d ON true WHERE t.id=ANY($1::bigint[]) AND t.source_key LIKE 'inspection:%' AND t.assigned_to IS NULL`,
      [ids],
    )
  ).rows;
  for (const task of rows) {
    const matched = rules.filter(
      (r: any) =>
        r.enabled &&
        r.city_key === cityKey(task.city || "") &&
        r.uf === String(task.uf || "").toUpperCase(),
    );
    if (new Set(matched.map((r: any) => r.assignee)).size !== 1) continue;
    const rule = matched[0];
    await c.query(
      "UPDATE web_tasks SET assigned_to=$2,first_assigned_at=now() WHERE id=$1",
      [task.id, rule.assignee],
    );
    await c.query(
      "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Atribuição automática',$2,true,'Sistema','Sistema')",
      [
        task.id,
        "Orçamentista: " +
          rule.display_name +
          ". Regra de cidade/UF do cliente.",
      ],
    );
    await c.query(
      "INSERT INTO web_task_notifications(task_id,task_version,recipient) SELECT id,version,$2 FROM web_tasks WHERE id=$1 ON CONFLICT DO NOTHING",
      [task.id, rule.assignee],
    );
  }
}
