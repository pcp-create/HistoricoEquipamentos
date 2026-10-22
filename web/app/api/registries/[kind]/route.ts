import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import {
  listRegistry,
  saveRegistry,
  manualKinds,
  validRegistry,
} from "@/lib/service-orders/registries";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (b: unknown, s = 200) =>
  Response.json(b, {
    status: s,
    headers: { "Cache-Control": "private, no-store" },
  });
type Context = { params: Promise<{ kind: string }> };
export async function GET(_r: Request, context: Context) {
  try {
    await requireUser();
    const { kind } = await context.params;
    if (!validRegistry(kind)) return json({ error: "Cadastro inválido." }, 404);
    return json(await listRegistry(kind));
  } catch (e) {
    return json(
      {
        error:
          e instanceof Unauthorized
            ? "Sessão expirada."
            : "Não foi possível consultar o cadastro.",
      },
      e instanceof Unauthorized ? 401 : 503,
    );
  }
}
export async function POST(r: Request, context: Context) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser();
    const { kind } = await context.params;
    if (!validRegistry(kind)) return json({ error: "Cadastro inválido." }, 404);
    const count = await saveRegistry(
      kind,
      manualKinds.includes(kind) ? await r.json() : {},
      u.email,
    );
    return json({ ...(await listRegistry(kind)), count });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Unauthorized
            ? "Sessão expirada."
            : e instanceof Error
              ? e.message
              : "Não foi possível salvar.",
      },
      e instanceof Unauthorized ? 401 : 400,
    );
  }
}
