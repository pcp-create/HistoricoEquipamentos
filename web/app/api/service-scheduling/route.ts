import {syncTasks} from "@/lib/tasks/store";
import { requireAdmin, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import {
  schedulingData,
  scheduleForOrder,
  mutateSchedule,
  ScheduleInputError,
  ScheduleConflict,
} from "@/lib/service-scheduling/store";
export const runtime = "nodejs";
const json = (v: any, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  const status =
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof ScheduleInputError
          ? 400
          : e instanceof ScheduleConflict
            ? 409
            : 503;
  return json(
    {
      error:
        status === 403
          ? "Você não tem permissão para esta ação."
          : status === 401
            ? "Sessão expirada."
            : status === 503
              ? "Não foi possível atualizar a programação."
              : (e as Error).message,
    },
    status,
  );
}
export async function GET(req: Request) {
  try {
    const user = await requireAdmin();
    const params = new URL(req.url).searchParams;
    if (params.has("orderId")) return json(await scheduleForOrder(params.get("company") || "", params.get("orderId") || ""));
    return json(
      await schedulingData(new URL(req.url).searchParams.get("id"), user.email),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireAdmin(),
      raw = await req.text();
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    const result=await mutateSchedule(b, user.email);
    if(b.action==="review") {try {await syncTasks();} catch {console.error("TASK_SYNC_AFTER_CHECKLIST_REVIEW_FAILED");}}
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
