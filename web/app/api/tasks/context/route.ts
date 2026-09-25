import { requireUser, Unauthorized } from "@/lib/auth";
import { database } from "@/lib/db";
import {
  creationContext,
  TaskContextError,
} from "@/lib/tasks/creation-context";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    await requireUser();
    const context = await creationContext(
      database(),
      Object.fromEntries(new URL(req.url).searchParams),
    );
    const users = (
      await database().query(
        "SELECT email,display_name FROM web_user_access WHERE enabled ORDER BY display_name,email",
      )
    ).rows;
    return Response.json(
      { ...context, users },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof TaskContextError
            ? e.message
            : e instanceof Unauthorized
              ? "Sessão expirada."
              : "Não foi possível carregar os dados da tarefa.",
      },
      {
        status:
          e instanceof TaskContextError
            ? 400
            : e instanceof Unauthorized
              ? 401
              : 503,
      },
    );
  }
}
