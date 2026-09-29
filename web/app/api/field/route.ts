import { requireAdmin, sameOrigin, Forbidden, Unauthorized } from "@/lib/auth";
import {
  fieldData,
  fieldAction,
  FieldError,
} from "@/lib/service-scheduling/field-store";
export const runtime = "nodejs";
const json = (body: any, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  const status =
    e instanceof Forbidden
      ? 403
      : e instanceof Unauthorized
        ? 401
        : e instanceof FieldError
          ? 400
          : 503;
  return json(
    {
      error:
        status === 503
          ? "Não foi possível acessar a programação. Tente novamente."
          : status === 403
            ? "Esta operação não foi enviada para você."
            : status === 401
              ? "Entre novamente para continuar."
              : (e as Error).message,
    },
    status,
  );
}
export async function GET(req: Request) {
  try {
    const user = await requireAdmin();
    return json(
      await fieldData(
        user.email,
        new URL(req.url).searchParams.get("operation"),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireAdmin();
    const raw = await req.text();
    if (raw.length > 300000)
      return json({ error: "Registro excede o limite." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    return json(await fieldAction(body, user.email));
  } catch (e) {
    return failure(e);
  }
}
