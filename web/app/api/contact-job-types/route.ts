import { requireUser, sameOrigin, Forbidden, Unauthorized } from "@/lib/auth";
import { AdminInputError } from "@/lib/admin-store";
import { listJobTypes, saveJobType } from "@/lib/visits/job-types";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function fail(e: unknown) {
  return json(
    {
      error:
        e instanceof AdminInputError
          ? e.message
          : "Não foi possível acessar os tipos de cargo.",
    },
    e instanceof Unauthorized
      ? 401
      : e instanceof Forbidden
        ? 403
        : e instanceof AdminInputError
          ? 400
          : 503,
  );
}
export async function GET(r: Request) {
  try {
    const u = await requireUser();
    return json({
      rows: await listJobTypes(
        u.email,
        new URL(r.url).searchParams.get("all") === "1",
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser(),
      raw = await r.text();
    if (raw.length > 3000) throw new AdminInputError("Dados excedem o limite.");
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AdminInputError("Dados inválidos.");
    }
    return json({ row: await saveJobType(b, u.email) });
  } catch (e) {
    return fail(e);
  }
}
