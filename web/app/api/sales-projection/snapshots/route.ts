import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { snapshotCreate, snapshotList, snapshotRead, snapshotPeriod, SnapshotInputError } from "@/lib/sales-projection/snapshots";
export const runtime = "nodejs";
export const maxDuration = 120;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(e: unknown) {
  return json({ error: e instanceof SnapshotInputError ? e.message : e instanceof Unauthorized ? "Sessão expirada." : e instanceof Forbidden ? "Acesso não permitido." : "Não foi possível acessar as parciais. Confira a integração e a migração de parciais." },
    e instanceof SnapshotInputError ? 400 : e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503);
}
export async function GET(request: Request) {
  try {
    await requireUser();
    const params = new URL(request.url).searchParams;
    const period = snapshotPeriod(params.get("period"));
    return json(params.has("id") ? await snapshotRead(params.get("id")!, period) : { rows: await snapshotList(period) });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  try {
    const user = await requireUser();
    const text = await request.text();
    if (text.length > 2000) return json({ error: "Solicitação muito grande." }, 413);
    let input;
    try { input = JSON.parse(text); } catch { return json({ error: "Dados inválidos." }, 400); }
    if (!input || typeof input !== "object") return json({ error: "Dados inválidos." }, 400);
    return json(await snapshotCreate(input, user.email), 201);
  } catch (e) { return failure(e); }
}
