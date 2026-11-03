import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { database } from "@/lib/db";
import { releaseSchedule } from "@/lib/service-scheduling/release";
import { prepareCustomerDelivery } from "@/lib/service-scheduling/customer-delivery";
export const runtime = "nodejs";
export const maxDuration = 120;
const json = (b: any, status = 200) =>
  Response.json(b, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  let c;
  try {
    const user = await requireUser();
    const raw = await req.text();
    if (raw.length > 5000)
      return json({ error: "Solicitação muito grande." }, 413);
    const b = JSON.parse(raw);
    if (
      typeof b.scheduleId !== "string" ||
      !/^\d{1,18}$/.test(b.scheduleId) ||
      !["release", "customer_report"].includes(b.action)
    )
      return json({ error: "Solicitação inválida." }, 400);
    c = await database().connect();
    await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(728001)");
    const result =
      b.action === "release"
        ? await releaseSchedule(
            c,
            b.scheduleId,
            user.email,
            b.kind,
            b.recipient,
          )
        : await prepareCustomerDelivery(c, b, user.email);
    await c.query("COMMIT");
    return json(result);
  } catch (e) {
    if (c) await c.query("ROLLBACK");
    console.error(
      "SERVICE_WORKFLOW_FAILED",
      e instanceof Error ? e.name : "Error",
    );
    return json(
      {
        error:
          e instanceof Unauthorized
            ? "Sessão expirada."
            : e instanceof Error && !(e as any).code
              ? e.message
              : "Não foi possível concluir o encaminhamento.",
      },
      e instanceof Unauthorized ? 401 : 400,
    );
  } finally {
    c?.release();
  }
}
