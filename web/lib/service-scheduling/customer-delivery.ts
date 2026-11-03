import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { orderReportPdf } from "./order-report-store";
import { queueServiceMessage } from "./notifications";
import { PUBLIC_SYSTEM_URL } from "../public-url";
export async function prepareCustomerDelivery(
  c: any,
  input: any,
  actor: string,
) {
  const phone = String(input.phone || "").replace(/[\s()+-]/g, "");
  if (!/^[1-9]\d{9,14}$/.test(phone))
    throw Error("Informe o WhatsApp do cliente com código do país e DDD.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId || "",
    )
  )
    throw Error("Envio inválido.");
  const old = (
    await c.query(
      "SELECT actor,phone,schedule_id FROM web_service_customer_reports WHERE id=$1",
      [input.requestId],
    )
  ).rows[0];
  if (old) {
    if (
      old.actor !== actor ||
      old.phone !== phone ||
      String(old.schedule_id) !== input.scheduleId
    )
      throw Error("Identificador utilizado em outro envio.");
    return { queued: true };
  }
  const schedule = (
    await c.query(
      "SELECT * FROM web_service_schedules WHERE id=$1 AND active FOR SHARE",
      [input.scheduleId],
    )
  ).rows[0];
  if (!schedule) throw Error("Programação indisponível.");
  const ops = (
    await c.query(
      "SELECT * FROM web_service_operations WHERE schedule_id=$1 ORDER BY position FOR SHARE",
      [input.scheduleId],
    )
  ).rows;
  if (
    !ops.length ||
    ops.some((o: any) => !["reviewed", "completed"].includes(o.status))
  )
    throw Error(
      "Conclua a revisão de todas as operações antes de enviar ao cliente.",
    );
  const selected = ops
    .filter((o: any) => o.document.checklistRun)
    .map((o: any) => o.id);
  if (!selected.length)
    throw Error("A OS não possui relatório técnico para enviar.");
  // Client receives the complete report; budget-only internal notes never leave here.
  const pdf = await orderReportPdf(
    {
      scheduleId: input.scheduleId,
      operationIds: selected,
      mode: "complete",
      includeTimeline: true,
    },
    actor,
    false,
    c,
  );
  const token = randomBytes(32).toString("hex"),
    hash = createHash("sha256").update(token).digest("hex");
  await c.query(
    "INSERT INTO web_service_customer_reports(id,schedule_id,actor,phone,token_hash,filename,content,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '14 days')",
    [
      input.requestId,
      input.scheduleId,
      actor,
      phone,
      hash,
      pdf.filename,
      Buffer.from(pdf.bytes),
    ],
  );
  await queueServiceMessage(
    c,
    "customer-report:" + input.requestId,
    `RJ Compressores · Relatório técnico revisado\n\nSegue o relatório do atendimento. Link disponível por 14 dias:\n${PUBLIC_SYSTEM_URL}/api/service-scheduling/customer-report/${token}`,
    { phone },
  );
  return { queued: true };
}
