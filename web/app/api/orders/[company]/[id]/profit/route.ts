import { userDisplayName } from "@/lib/user-display-name";
import { NextResponse } from "next/server";
import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { logDataError } from "@/lib/data-error";
import {
  getOrderProfit,
  saveOrderProfit,
  ProfitInputError,
  ProfitConflict,
} from "@/lib/order-profit-store";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  if (error instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  if (error instanceof ProfitInputError)
    return json({ error: error.message }, 400);
  if (error instanceof ProfitConflict)
    return json({ error: error.message }, 409);
  const code = logDataError("order-profit", error);
  return json(
    { error: "Não foi possível consultar ou salvar o cálculo.", code },
    503,
  );
}
type Context = { params: Promise<{ company: string; id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { company, id } = await context.params;
    return json({ calculation: await getOrderProfit(company, id) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    const { company, id } = await context.params;
    const raw = await request.text();
    if (raw.length > 2000) return json({ error: "Cálculo inválido." }, 400);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ProfitInputError("Cálculo inválido.");
    }
    return json({
      calculation: await saveOrderProfit(
        company,
        id,
        body,
        user.email,
        userDisplayName(user),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
