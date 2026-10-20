import { requireUser, Unauthorized, Forbidden } from "@/lib/auth";
import { visitsData } from "@/lib/visits/store";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await visitsData(user.email, undefined, true), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status =
      error instanceof Unauthorized
        ? 401
        : error instanceof Forbidden
          ? 403
          : 503;
    return Response.json(
      {
        error:
          status === 403
            ? "A Gestão de Visitas está disponível somente para administradores."
            : status === 401
              ? "Sessão expirada."
              : "Não foi possível carregar a gestão de visitas.",
      },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
