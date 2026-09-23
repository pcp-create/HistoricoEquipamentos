import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { createPlanQuote } from "@/lib/equipment-management/plan-quote";
import { EquipmentInputError } from "@/lib/equipment-management/planning";
import { EquipmentConflict } from "@/lib/equipment-management/store";
import { QuoteValidation } from "@/lib/quotes/types";
import { logDataError } from "@/lib/data-error";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    const raw = await req.text();
    if (raw.length > 5000)
      return json({ error: "Dados excedem o limite." }, 413);
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return json({ error: "Dados inválidos." }, 400);
    }
    return json(await createPlanQuote(input, user));
  } catch (e) {
    if (e instanceof Unauthorized)
      return json({ error: "Sessão expirada." }, 401);
    if (e instanceof EquipmentInputError || e instanceof QuoteValidation)
      return json({ error: e.message }, 400);
    if (e instanceof EquipmentConflict) return json({ error: e.message }, 409);
    logDataError("plan-quote", e);
    return json(
      { error: "Não foi possível gerar o orçamento. Tente novamente." },
      503,
    );
  }
}
