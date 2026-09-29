import { NextResponse } from "next/server";
import { requireAdmin, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import {
  orderLinks,
  saveOrderLink,
  OrderLinkInputError,
  OrderLinkConflict,
} from "@/lib/order-links";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
type Context = { params: Promise<{ company: string; id: string }> };
function failure(e: unknown) {
  if (e instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  if (e instanceof Forbidden) return json({ error: "Acesso negado." }, 403);
  if (e instanceof OrderLinkInputError) return json({ error: e.message }, 400);
  if (e instanceof OrderLinkConflict) return json({ error: e.message }, 409);
  return json(
    { error: "Não foi possível consultar ou salvar o vínculo." },
    503,
  );
}
export async function GET(req: Request, ctx: Context) {
  try {
    await requireAdmin();
    const { company, id } = await ctx.params;
    const u = new URL(req.url);
    return json(
      await orderLinks(
        company,
        id,
        u.searchParams.get("q"),
        Number(u.searchParams.get("page") || 0),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireAdmin();
    const { company, id } = await ctx.params;
    let b;
    try {
      b = await req.json();
    } catch {
      throw new OrderLinkInputError("Dados inválidos.");
    }
    return json(await saveOrderLink(company, id, b, user.email));
  } catch (e) {
    return failure(e);
  }
}
