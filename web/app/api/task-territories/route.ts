import { requireAdmin, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { AdminInputError } from "@/lib/admin-store";
import { territoryList, saveTerritory } from "@/lib/tasks/territories";
export const runtime = "nodejs";
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  return json(
    {
      error:
        e instanceof AdminInputError
          ? e.message
          : e instanceof Unauthorized
            ? "Sessão expirada."
            : e instanceof Forbidden
              ? "Acesso exclusivo de administradores."
              : "Não foi possível atualizar a divisão comercial.",
    },
    e instanceof AdminInputError
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
    await requireAdmin();
    return json(await territoryList());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireAdmin();
    const raw = await req.text();
    if (raw.length > 2000)
      return json({ error: "Dados excedem o limite." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    await saveTerritory(body, user.email);
    return json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
