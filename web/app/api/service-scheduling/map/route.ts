import { requireAdmin, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import {
  scheduleMapData,
  changeScheduleMap,
  MapInputError,
} from "@/lib/service-scheduling/map-store";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  const status =
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof MapInputError
          ? 400
          : 503;
  return json(
    {
      error:
        status === 400
          ? (e as Error).message
          : status === 401
            ? "Sessão expirada."
            : status === 403
              ? "Acesso não autorizado."
              : "Não foi possível carregar o mapa da programação.",
    },
    status,
  );
}
export async function GET() {
  try {
    const user = await requireAdmin();
    return json(await scheduleMapData(user.email));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireAdmin();
    const raw = await req.text();
    if (raw.length > 4000) return json({ error: "Dados inválidos." }, 400);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    return json(await changeScheduleMap(body, user.email));
  } catch (e) {
    return failure(e);
  }
}
