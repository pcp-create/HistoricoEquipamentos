import { requireUser, Unauthorized, Forbidden } from "@/lib/auth";
import { salesProjection } from "@/lib/sales-projection/store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireUser();
    const period = new URL(request.url).searchParams.get("period") || "";
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
      return Response.json(
        { error: "Selecione um mês válido." },
        { status: 400 },
      );
    return Response.json(await salesProjection(period), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Unauthorized
            ? "Sua sessão expirou."
            : e instanceof Forbidden
              ? "Acesso não permitido."
              : "Não foi possível carregar a projeção. Confira se a integração comercial está disponível.",
      },
      {
        status:
          e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503,
      },
    );
  }
}
