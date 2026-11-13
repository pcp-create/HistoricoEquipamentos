import "server-only";
import { queueServiceMessage } from "./notifications";
import { PUBLIC_SYSTEM_URL } from "../public-url";
import { operationNumber } from "./operation-number";
export async function notifyTimeRequestRejection(
  c: any,
  r: any,
  reviewer: string,
  reviewerName: string,
  reason: string,
) {
  const context = (
    await c.query(
      `SELECT p.id,p.position,p.schedule_id,s.created_by,s.order_id,COALESCE(o.numero_sequencia,s.order_id)::text number FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id WHERE p.id=$1`,
      [r.operation_id],
    )
  ).rows[0];
  if (!context) throw Error("Operação da solicitação não encontrada.");
  let planner;
  if (
    (
      await c.query(
        "SELECT to_regclass('public.web_service_operation_workflows') IS NOT NULL available",
      )
    ).rows[0]?.available
  )
    planner = (
      await c.query(
        "SELECT planner FROM web_service_operation_workflows WHERE operation_id=$1",
        [r.operation_id],
      )
    ).rows[0]?.planner;
  const dispatcher = (
    await c.query(
      "SELECT e.actor FROM web_service_operation_events e JOIN web_user_access u ON u.email=e.actor WHERE e.operation_id=$1 AND e.action='dispatch' AND u.enabled ORDER BY e.created_at DESC,e.id DESC LIMIT 1",
      [r.operation_id],
    )
  ).rows[0]?.actor;
  const candidates = [planner, dispatcher, context.created_by].filter(Boolean);
  planner = (
    await c.query(
      "SELECT email FROM web_user_access WHERE enabled AND email=ANY($1::text[]) ORDER BY array_position($1::text[],email) LIMIT 1",
      [candidates],
    )
  ).rows[0]?.email;
  const requester =
    (
      await c.query("SELECT display_name FROM web_user_access WHERE email=$1", [
        r.requester,
      ])
    ).rows[0]?.display_name || r.requester;
  const fmt = (v: string) =>
    new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const text = `⚠️ *Ajuste de apontamento reprovado*\nOS ${context.number} · Operação ${operationNumber(context.position)}\nSolicitante: ${requester}\nAnalisado por: ${reviewerName || reviewer}\nMotivo: ${reason}\nHorário: ${fmt(r.proposed.started_at)} até ${fmt(r.proposed.finished_at)}\n${r.applied_at ? "O ajuste já foi aplicado e permanece nos totais. Solicitante e planejamento devem tratar a correção manualmente." : "A solicitação antiga não havia sido aplicada. Confira os horários com o planejamento."}\n${PUBLIC_SYSTEM_URL}/programacao?id=${context.schedule_id}`;
  for (const recipient of new Set([r.requester, planner].filter(Boolean)))
    await queueServiceMessage(
      c,
      `time-adjustment-rejected:${r.id}:${recipient}`,
      text,
      { recipient },
    );
}
