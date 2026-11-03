import "server-only";
import { handoffOperation } from "./workflow";
export async function releaseSchedule(
  c: any,
  scheduleId: string,
  actor: string,
  kind: "internal" | "billing",
  recipient: string,
) {
  if (!["internal", "billing"].includes(kind))
    throw Error("Liberação inválida.");
  if (typeof recipient !== "string" || !recipient.trim())
    throw Error("Selecione o responsável pela próxima etapa.");
  const schedule = (
    await c.query(
      "SELECT * FROM web_service_schedules WHERE id=$1 AND active FOR UPDATE",
      [scheduleId],
    )
  ).rows[0];
  if (!schedule) throw Error("Programação indisponível.");
  const operations = (
    await c.query(
      "SELECT * FROM web_service_operations WHERE schedule_id=$1 ORDER BY position FOR UPDATE",
      [scheduleId],
    )
  ).rows;
  if (
    !operations.length ||
    operations.some((o: any) => !["reviewed", "completed"].includes(o.status))
  )
    throw Error("Revise todas as operações antes de liberar a OS.");
  if (schedule.release_kind === kind) {
    const different = (
      await c.query(
        "SELECT 1 FROM web_service_operation_workflows w JOIN web_service_operations p ON p.id=w.operation_id JOIN web_tasks t ON t.id=w.task_id WHERE p.schedule_id=$1 AND t.assigned_to IS DISTINCT FROM $2 LIMIT 1",
        [scheduleId, recipient],
      )
    ).rows.length;
    if (!different) return { released: true, kind };
  }
  if (
    (
      await c.query(
        "SELECT 1 FROM web_field_time_requests WHERE operation_id=ANY($1::uuid[]) AND status='pending' LIMIT 1",
        [operations.map((o: any) => o.id)],
      )
    ).rows.length
  )
    throw Error("Analise as solicitações de apontamento antes da liberação.");
  for (const op of operations)
    await handoffOperation(c, op, schedule, actor, kind, recipient);
  await c.query(
    "UPDATE web_service_schedules SET release_kind=$2 WHERE id=$1",
    [scheduleId, kind],
  );
  await c.query(
    "INSERT INTO web_access_events(event,email,actor,details) VALUES('schedule_released',$1,$1,$2)",
    [actor, JSON.stringify({ scheduleId, kind, recipient })],
  );
  return { released: true, kind };
}
