import { reportTokenMatches } from "@/lib/preventive-reports/access";
import { incomingEvent, legacyDemandCommand } from "@/lib/dsu/protocol";
import { processMessage } from "@/lib/dsu/assistant";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: Request) {
  if (
    !reportTokenMatches(
      req.headers.get("authorization"),
      process.env.DSU_AUTOMATION_TOKEN,
    )
  )
    return Response.json(
      { error: "Credencial inválida." },
      { status: 401, headers },
    );
  const raw = await req.text();
  if (raw.length > 64000)
    return Response.json(
      { error: "Mensagem excede o limite." },
      { status: 413, headers },
    );
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400, headers });
  }
  const event = incomingEvent(
    body,
    process.env.DSU_WHATSAPP_INSTANCE || "BotDemandas",
  );
  if (!event) return Response.json({ replies: [], ignored: true }, { headers });
  try {
    return Response.json(
      await processMessage(
        event,
        body.legacyRouting === true && legacyDemandCommand(body, event.text),
      ),
      { headers },
    );
  } catch {
    console.error("DSU_PROCESS_FAILED");
    return Response.json(
      { error: "Falha ao processar mensagem." },
      { status: 503, headers },
    );
  }
}
