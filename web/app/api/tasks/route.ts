import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import {
  createTask,
  listTasks,
  taskDetail,
  updateTask,
  syncTasks,
  attachTask,
  TaskInputError,
  TaskConflict,
} from "@/lib/tasks/store";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers });
function failure(e: unknown) {
  if (e instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  if (e instanceof TaskInputError) return json({ error: e.message }, 400);
  if (e instanceof TaskConflict) return json({ error: e.message }, 409);
  console.error("TASK_OPERATION_FAILED");
  return json(
    {
      error:
        "Não foi possível processar as tarefas. Tente atualizar novamente.",
    },
    503,
  );
}
export async function GET(req: Request) {
  try {
    const user = await requireUser(),
      p = new URL(req.url).searchParams;
    return json(
      p.has("id") ? await taskDetail(p.get("id")!) : await listTasks(p, user),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      if (Number(req.headers.get("content-length") || 0) > 3100000)
        return json({ error: "Arquivo excede 3 MB." }, 413);
      const form = await req.formData(),
        file = form.get("file");
      if (!(file instanceof File))
        throw new TaskInputError("Selecione um arquivo.");
      return json(await attachTask(String(form.get("id")), file, user));
    }
    const raw = await req.text();
    if (raw.length > 16000)
      return json({ error: "Dados excedem o limite." }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new TaskInputError("Dados inválidos.");
    }
    if (body?.action === "sync") return json(await syncTasks());
    if (body?.action === "create")
      return json(await createTask(body, user), 201);
    return json(await updateTask(body, user));
  } catch (e) {
    return failure(e);
  }
}
