import { requireAdmin, sameOrigin, Forbidden, Unauthorized } from "@/lib/auth";
import {
  personalTimeLogs,
  changeTimeRequest,
  TimeRequestError,
} from "@/lib/service-scheduling/time-request-store";
export const runtime = "nodejs";
const json = (v: any, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const failure = (e: unknown) =>
  json(
    {
      error:
        e instanceof Forbidden
          ? "Você não tem permissão para analisar esta solicitação."
          : e instanceof TimeRequestError
            ? e.message
            : "Não foi possível acessar os apontamentos.",
    },
    e instanceof Forbidden
      ? 403
      : e instanceof Unauthorized
        ? 401
        : e instanceof TimeRequestError
          ? 400
          : 503,
  );
export async function GET() {
  try {
    const u = await requireAdmin();
    return json(await personalTimeLogs(u.email));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireAdmin();
    const raw = await req.text();
    if (raw.length > 40000)
      return json({ error: "Dados excedem o limite." }, 413);
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    return json(await changeTimeRequest(b, u.email));
  } catch (e) {
    return failure(e);
  }
}
