import { userDisplayName } from "@/lib/user-display-name";
import { NextResponse } from "next/server";
import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { recordActivity, accessRecord } from "@/lib/admin-store";
import { optionalActivityLocation } from "@/lib/activity-location";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const user = await requireUser();
    const text = await req.text();
    if (text.length > 2000)
      return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });
    let body;
    try { body = text ? JSON.parse(text) : null; } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }
    await recordActivity(user, "heartbeat", optionalActivityLocation(body?.location));
    const access = await accessRecord(user.email);
    return NextResponse.json(
      {
        admin: access?.role === "admin",
        displayName: access?.display_name || userDisplayName(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Atividade indisponível." },
      { status: e instanceof Unauthorized ? 401 : 503 },
    );
  }
}
