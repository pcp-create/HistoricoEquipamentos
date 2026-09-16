import { NextResponse } from "next/server";
import { requireAdmin, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { adminOverview, setAccess, AdminInputError } from "@/lib/admin-store";
export const runtime = "nodejs";
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  if (e instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  if (e instanceof Forbidden)
    return json({ error: "Acesso exclusivo de administradores." }, 403);
  if (e instanceof AdminInputError) return json({ error: e.message }, 400);
  console.error("ADMIN_OPERATION_FAILED");
  return json({ error: "Não foi possível consultar a administração." }, 503);
}
export async function GET() {
  try {
    const user = await requireAdmin();
    return json({ ...(await adminOverview()), email: user.email });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireAdmin();
    const raw = await req.text();
    if (raw.length > 3000)
      return json({ error: "Dados excedem o limite." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    await setAccess(body, user);
    return json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
