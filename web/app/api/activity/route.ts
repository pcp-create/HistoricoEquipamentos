import { NextResponse } from "next/server";
import { requireUser, sameOrigin, Unauthorized } from "@/lib/auth";
import { recordActivity, accessRecord } from "@/lib/admin-store";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const user = await requireUser();
    await recordActivity(user, "heartbeat");
    const access = await accessRecord(user.email);
    return NextResponse.json(
      { admin: access?.role === "admin" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Atividade indisponível." },
      { status: e instanceof Unauthorized ? 401 : 503 },
    );
  }
}
