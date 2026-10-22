import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { orderLookups } from "@/lib/service-orders/lookups";
import {
  prepareOrder,
  advanceOrder,
  submissions,
} from "@/lib/service-orders/store";
import {
  loadEdit,
  prepareEdit,
  advanceEdit,
  editStatus,
} from "@/lib/service-orders/edit";
import { OrderInputError } from "@/lib/service-orders/model";
export const runtime = "nodejs";
export const maxDuration = 120;
const json = (b: unknown, s = 200) =>
  Response.json(b, {
    status: s,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  return json(
    {
      error:
        e instanceof Unauthorized
          ? "Sessão expirada."
          : e instanceof OrderInputError
            ? e.message
            : "Não foi possível concluir a solicitação. Consulte os envios recentes antes de tentar novamente.",
    },
    e instanceof Unauthorized ? 401 : e instanceof OrderInputError ? 400 : 503,
  );
}
export async function GET(r: Request) {
  try {
    const u = await requireUser(),
      p = new URL(r.url).searchParams;
    return json(
      p.has("edit")
        ? await loadEdit(p.get("company") || "", p.get("order") || "")
        : p.has("editStatus")
          ? await editStatus(u.email, p.get("editStatus") || "")
          : p.has("lookup")
            ? await orderLookups(p)
            : { rows: await submissions(u.email, p.get("id") || undefined) },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser();
    if (Number(r.headers.get("content-length") || 0) > 500000)
      return json({ error: "Solicitação muito grande." }, 413);
    const b = await r.json();
    if (b.action === "edit-prepare")
      return json(
        await prepareEdit(
          u.email,
          b.id,
          b.company,
          b.order,
          b.version,
          b.draft,
        ),
      );
    if (b.action === "edit-advance")
      return json(await advanceEdit(u.email, b.id));
    if (b.action === "prepare")
      return json(await prepareOrder(u.email, b.id, b.draft));
    if (b.action === "advance") return json(await advanceOrder(u.email, b.id));
    throw new OrderInputError("Ação inválida.");
  } catch (e) {
    return failure(e);
  }
}
