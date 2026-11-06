import "server-only";
import {queueServiceMessage} from "./notifications";
import {PUBLIC_SYSTEM_URL} from "../public-url";
import {companyName} from "../company-names";
/** Called under the operation transaction lock. Manual source prevents automatic source reconciliation. */
export async function handoffOperation(
  c: any,
  operation: any,
  schedule: any,
  actor: string,
  phase: "execution" | "review" | "reviewed" | "internal" | "billing",
  recipient?: string,
) {
  const old = (
    await c.query(
      "SELECT * FROM web_service_operation_workflows WHERE operation_id=$1 FOR UPDATE",
      [operation.id],
    )
  ).rows[0];
  // Older automatically-created schedules have a system creator. The human
  // who dispatched the operation is the planner, not the technician finishing it.
  const dispatcher =
    !old && phase === "review"
      ? (
          await c.query(
            "SELECT e.actor FROM web_service_operation_events e JOIN web_user_access u ON u.email=e.actor WHERE e.operation_id=$1 AND e.action='dispatch' AND u.enabled ORDER BY e.created_at DESC,e.id DESC LIMIT 1",
            [operation.id],
          )
        ).rows[0]?.actor
      : null;
  const creator =
    schedule.created_by ||
    (
      await c.query(
        "SELECT created_by FROM web_service_schedules WHERE id=$1",
        [schedule.id],
      )
    ).rows[0]?.created_by;
  const planner =
    old?.planner || (phase === "review" ? dispatcher || creator : actor);
  const assigned =
    recipient ||
    (phase === "execution" ? operation.document.responsible : planner);
  if (
    !assigned ||
    !(
      await c.query(
        "SELECT 1 FROM web_user_access WHERE email=$1 AND enabled",
        [assigned],
      )
    ).rows.length
  )
    throw Error("Selecione um responsável ativo para a próxima etapa.");
  const order = (
    await c.query(
      "SELECT COALESCE(numero_sequencia,id_m8)::text number,cliente_nome,equipamento FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",
      [schedule.company_id, schedule.order_id],
    )
  ).rows[0];
  const titles = {
    execution: "Operação incluída na programação",
    review: "Operação aguardando revisão",
    reviewed: "Relatório revisado",
    internal: "Liberado para baixa interna",
    billing: "Liberado para faturamento",
  };
  const description = `${titles[phase]}. OS ${order?.number || schedule.order_id}, operação ${operation.position}. ${operation.document.description || ""}${phase === "execution" ? " · Data: " + (operation.document.date || "A confirmar") + " " + (operation.document.time || "") : ""}`;
  let taskId = old?.task_id;
  if (!taskId) {
    taskId = (
      await c.query(
        `INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,customer,source_status,priority,assigned_to,first_assigned_at,created_by,updated_by,order_company,order_id,order_number,followers,status)
   VALUES($1,'execution','Programação de OSs',$2,$3,$4,$5,'normal',$6,now(),$7,$7,$8,$9,$10,ARRAY[$7]::text[],'in_progress') RETURNING id`,
        [
          "manual:schedule-operation:" + operation.id,
          `OS ${order?.number || schedule.order_id} · Operação ${operation.position}`.slice(
            0,
            160,
          ),
          order?.equipamento || "",
          order?.cliente_nome || "",
          phase,
          assigned,
          actor,
          schedule.company_id,
          schedule.order_id,
          order?.number || String(schedule.order_id),
        ],
      )
    ).rows[0].id;
    await c.query(
      "INSERT INTO web_service_operation_workflows(operation_id,task_id,planner,phase) VALUES($1,$2,$3,$4)",
      [operation.id, taskId, planner, phase],
    );
  } else {
    await c.query(
      "UPDATE web_tasks SET assigned_to=$2,source_status=$3,status='in_progress',completed_at=NULL,kanban_column=NULL,stage_id=CASE WHEN $3 IN('internal','billing') THEN stage_id ELSE NULL END,version=version+1,updated_at=now(),updated_by=$4 WHERE id=$1",
      [taskId, assigned, phase, actor],
    );
    await c.query(
      "UPDATE web_service_operation_workflows SET phase=$2,updated_at=now() WHERE operation_id=$1",
      [operation.id, phase],
    );
  }
  await c.query(
    "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,true,$4,COALESCE((SELECT display_name FROM web_user_access WHERE email=$4),$4))",
    [taskId, titles[phase], description, actor],
  );
  // Operations keep their own Kanban tasks. WhatsApp is deduplicated by OS and technician.
  // Do not notify the planner when the task changes hands for review/release.
  if(phase==='execution'&&operation.sent_at){
    await queueServiceMessage(c,`schedule-dispatch:${schedule.id}:${assigned}`,
      `📋 *OS incluída na sua programação*\n*OS ${order?.number||schedule.order_id} · ${companyName(schedule.company_id)}*\nCliente: ${order?.cliente_nome||'Não informado'}\nEquipamento: ${order?.equipamento||'Não informado'}\nConfira as operações, datas e orientações no Portal Técnico: ${PUBLIC_SYSTEM_URL}/tecnico`,
      {recipient:assigned});
  }
  if(phase==='reviewed'){
    const available=(await c.query("SELECT to_regprocedure('route_schedule_flow_tasks(bigint,bigint,text)') IS NOT NULL enabled")).rows[0]?.enabled;
    if(available)await c.query('SELECT route_schedule_flow_tasks($1::bigint,$2::bigint,$3::text)',[schedule.company_id,schedule.order_id,actor]);
  }
  return String(taskId);
}
