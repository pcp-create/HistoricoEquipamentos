import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { TaskInputError, TaskConflict } from "@/lib/tasks/store";
import { taskChecklists, changeChecklist } from "@/lib/tasks/checklists";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function fail(e: unknown) {
  return json(
    {
      error:
        e instanceof TaskInputError || e instanceof TaskConflict
          ? e.message
          : e instanceof Unauthorized
            ? "Sessão expirada."
            : e instanceof Forbidden
              ? "Acesso não permitido."
              : "Não foi possível carregar ou salvar a lista de verificação.",
    },
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof TaskConflict
          ? 409
          : e instanceof TaskInputError
            ? 400
            : 503,
  );
}
export async function GET(r: Request) {
  try {
    const u = await requireUser();
    return json(
      await taskChecklists(
        new URL(r.url).searchParams.get("taskId") || "",
        u.email,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser();
    const raw = await r.text();
    if (raw.length > 4000)
      return json({ error: "Dados excedem o limite." }, 413);
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new TaskInputError("Dados inválidos.");
    }
    return json(await changeChecklist(b, u.email));
  } catch (e) {
    return fail(e);
  }
}
