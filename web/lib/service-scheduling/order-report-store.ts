import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import { canIncludeInOrderReport, orderReport } from "./order-report";
import { renderChecklistPdf } from "./checklist-pdf";
import type { ReportMode } from "./checklist-report";

export class OrderReportInputError extends Error {}
export class OrderReportConflict extends Error {}
export function validateOrderReportSelection(body: any): {
  scheduleId: string;
  operationIds: string[];
  mode: ReportMode;
} {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !body ||
    typeof body.scheduleId !== "string" ||
    !/^\d{1,18}$/.test(body.scheduleId)
  )
    throw new OrderReportInputError("Programação inválida.");
  if (
    !Array.isArray(body.operationIds) ||
    !body.operationIds.length ||
    body.operationIds.length > 100 ||
    body.operationIds.some(
      (id: any) => typeof id !== "string" || !uuid.test(id),
    )
  )
    throw new OrderReportInputError(
      "Selecione de 1 a 100 operações para gerar o relatório.",
    );
  const operationIds = body.operationIds.map((id: string) => id.toLowerCase());
  if (new Set(operationIds).size !== operationIds.length)
    throw new OrderReportInputError("Há operações repetidas na seleção.");
  const mode = body.mode ?? "complete";
  if (!["complete", "summary", "budget"].includes(mode))
    throw new OrderReportInputError("Tipo de relatório inválido.");
  return { scheduleId: body.scheduleId, operationIds, mode };
}

/** Read one consistent snapshot, rechecking permissions and operation ownership server-side. */
export async function loadOrderReport(body: any, email: string) {
  const { scheduleId, operationIds, mode } = validateOrderReportSelection(body);
  const c = await database().connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const user = (
      await c.query("SELECT role,enabled FROM web_user_access WHERE email=$1", [
        email,
      ])
    ).rows[0];
    if (!user?.enabled || user.role !== "admin") throw new Forbidden();
    const schedule = (
      await c.query(
        `SELECT s.*,to_jsonb(o) AS order_record FROM web_service_schedules s
   LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id WHERE s.id=$1`,
        [scheduleId],
      )
    ).rows[0];
    if (!schedule)
      throw new OrderReportInputError("Programação não encontrada.");
    const operations = (
      await c.query(
        "SELECT * FROM web_service_operations WHERE schedule_id=$1 AND id=ANY($2::uuid[])",
        [scheduleId, operationIds],
      )
    ).rows;
    if (operations.length !== operationIds.length)
      throw new OrderReportInputError(
        "Selecione somente operações desta OS. Atualize a programação e tente novamente.",
      );
    if (operations.some((op) => !canIncludeInOrderReport(op)))
      throw new OrderReportConflict(
        "Uma operação selecionada ainda não foi revisada ou não possui relatório. Atualize a programação e confira a seleção.",
      );
    const users = (
      await c.query("SELECT email,display_name FROM web_user_access")
    ).rows;
    const sessions = (
      await c.query(
        "SELECT f.*,u.display_name FROM web_field_sessions f LEFT JOIN web_user_access u ON u.email=f.actor WHERE f.operation_id=ANY($1::uuid[])",
        [operationIds],
      )
    ).rows;
    const events = (
      await c.query(
        "SELECT * FROM web_field_events WHERE operation_id=ANY($1::uuid[]) AND action IN ('start_work','start_travel','pause','resume','stop') ORDER BY created_at,id",
        [operationIds],
      )
    ).rows;
    const history = (
      await c.query(
        "SELECT e.*,u.display_name FROM web_service_operation_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE e.operation_id=ANY($1::uuid[])",
        [operationIds],
      )
    ).rows;
    const model = orderReport(
      {
        schedule,
        detail: { order: schedule.order_record || {} },
        operations,
        users,
        fieldSessions: sessions,
        fieldEvents: events,
        events: history,
      },
      operationIds,
      mode,
    );
    const photos: any[] = [];
    for (const chapter of model.chapters) {
      const ids = [
        ...new Set(
          chapter.report.flatMap((s) =>
            s.groups.flatMap((g) => g.fields.flatMap((f) => f.photos)),
          ),
        ),
      ];
      if (ids.length) {
        const own = (
          await c.query(
            "SELECT id::text,content FROM web_service_checklist_photos WHERE operation_id=$1 AND id=ANY($2::bigint[])",
            [chapter.id, ids],
          )
        ).rows;
        if (own.length !== ids.length)
          throw new OrderReportConflict(
            "Há fotos indisponíveis em uma operação. Confira os anexos antes de gerar o relatório.",
          );
        photos.push(...own);
      }
    }
    await c.query("COMMIT");
    return { model, photos };
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
export async function orderReportPdf(body: any, email: string) {
  const { model, photos } = await loadOrderReport(body, email);
  return {
    bytes: await renderChecklistPdf({
      ...model,
      client: "",
      equipment: "",
      photos,
    }),
    filename: `Relatorio-OS-${model.order.replace(/[^\w-]/g, "")}-unificado-${model.mode}.pdf`,
  };
}
