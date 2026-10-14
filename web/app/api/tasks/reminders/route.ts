import { assertTaskAccess } from "@/lib/tasks/privacy";
import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { listReminders, saveReminder } from "@/lib/tasks/reminders";
import { TaskInputError, TaskConflict } from "@/lib/tasks/store";
const json = (b: unknown, status = 200) =>
  Response.json(b, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const fail = (e: unknown) =>
  json(
    {
      error:
        e instanceof TaskInputError || e instanceof TaskConflict
          ? e.message
          : e instanceof Unauthorized
            ? "Sessão expirada."
            : "Não foi possível processar o alerta.",
    },
    e instanceof Forbidden ? 403 : e instanceof TaskInputError
      ? 400
      : e instanceof TaskConflict
        ? 409
        : e instanceof Unauthorized
          ? 401
          : 503,
  );
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    await assertTaskAccess(new URL(req.url).searchParams.get("taskId") || "0",user.email);
    return json({
      reminders: await listReminders(
        new URL(req.url).searchParams.get("taskId"),
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser();
    const raw = await req.text();
    if (raw.length > 2000) throw new TaskInputError("Dados excedem o limite.");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new TaskInputError("Dados inválidos.");
    }
    await assertTaskAccess(String(body.taskId || "0"),u.email);
    await saveReminder(body, u.email);
    return json({ saved: true });
  } catch (e) {
    return fail(e);
  }
}
