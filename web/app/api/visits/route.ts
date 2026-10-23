import {createVisitTask} from "@/lib/visits/tasks";
import {TaskInputError,TaskConflict} from "@/lib/tasks/store";
import { saveVisitMeter } from "@/lib/visits/equipment";
import { EquipmentInputError } from "@/lib/equipment-management/planning";
import { EquipmentConflict } from "@/lib/equipment-management/store";
import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { AdminInputError } from "@/lib/admin-store";
import { visitsData, saveVisit, saveCustomerLocation, administerVisit } from "@/lib/visits/store";
export const runtime = "nodejs";
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function fail(e: unknown) {
  return json(
    {
      error:
        (e instanceof AdminInputError || e instanceof TaskInputError || e instanceof TaskConflict || e instanceof EquipmentInputError || e instanceof EquipmentConflict)
          ? e.message
          : e instanceof Unauthorized
            ? "Sessão expirada."
            : e instanceof Forbidden
              ? "Acesso não permitido. Confira se o usuário está ativo e se a visita pertence a ele."
              : "Não foi possível carregar as visitas.",
    },
    e instanceof EquipmentConflict || e instanceof TaskConflict ? 409 : (e instanceof AdminInputError || e instanceof TaskInputError || e instanceof TaskConflict || e instanceof EquipmentInputError)
      ? 400
      : e instanceof Unauthorized
        ? 401
        : e instanceof Forbidden
          ? 403
          : 503,
  );
}
export async function GET() {
  try {
    const u = await requireUser();
    return json(await visitsData(u.email));
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser();
    const raw = await r.text();
    if (raw.length > 30000)
      return json({ error: "Conteúdo muito grande." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    if(body.action==="task")return json(await createVisitTask(body,u));
    if (["admin_edit","admin_delete"].includes(body.action)) await administerVisit(body,u.email);
    else if (body.action === "meter") await saveVisitMeter(body, u, body.management === true);
    else if (body.action === "location") await saveCustomerLocation(body, u.email);
    else await saveVisit(body, u.email);
    return json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
