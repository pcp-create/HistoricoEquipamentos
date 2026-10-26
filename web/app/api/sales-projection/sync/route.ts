import { requireUser, sameOrigin, Unauthorized, Forbidden } from "@/lib/auth";
import { manualSyncStatus, requestManualSync, SyncInputError } from "@/lib/sales-projection/manual-sync";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(e: unknown) {
  return json({ error: e instanceof SyncInputError ? e.message : e instanceof Unauthorized ? "Sessão expirada." : e instanceof Forbidden ? "Acesso não permitido." : "Não foi possível consultar o integrador." }, e instanceof SyncInputError ? 409 : e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503);
}
export async function GET() { try { await requireUser(); return json(await manualSyncStatus()); } catch (e) { return failure(e); } }
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origem inválida." }, 403);
  try { const user = await requireUser(); return json(await requestManualSync(user.email), 202); } catch (e) { return failure(e); }
}
