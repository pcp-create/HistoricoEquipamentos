import { requireUser, Unauthorized, Forbidden } from "@/lib/auth";
import { billingEvolution } from "@/lib/billing-evolution/store";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requireUser();
    return Response.json(await billingEvolution(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Unauthorized
            ? "Sessão expirada."
            : error instanceof Forbidden
              ? "Acesso não permitido."
              : "Não foi possível carregar o faturamento.",
      },
      {
        status:
          error instanceof Unauthorized
            ? 401
            : error instanceof Forbidden
              ? 403
              : 503,
      },
    );
  }
}
