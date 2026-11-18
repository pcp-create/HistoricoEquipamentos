import { requireUser, Forbidden, Unauthorized } from "@/lib/auth";
import { calendarEvents, CalendarInputError } from "@/lib/calendar/store";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  try {
    const user = await requireUser(),
      params = new URL(request.url).searchParams;
    return json(
      await calendarEvents(
        user.email,
        params.get("start") || "",
        params.get("end") || "",
      ),
    );
  } catch (e) {
    const status =
      e instanceof CalendarInputError
        ? 400
        : e instanceof Unauthorized
          ? 401
          : e instanceof Forbidden
            ? 403
            : 503;
    return json(
      {
        error:
          status === 400
            ? (e as Error).message
            : status === 401
              ? "Sessão expirada."
              : status === 403
                ? "Acesso não permitido."
                : "Não foi possível atualizar o calendário.",
      },
      status,
    );
  }
}
