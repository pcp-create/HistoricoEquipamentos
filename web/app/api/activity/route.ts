import { userDisplayName } from "@/lib/user-display-name";
import { NextResponse } from "next/server";
import { requireUser, sameOrigin, Unauthorized, PasswordChangeRequired } from "@/lib/auth";
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
      {
        admin: access?.role === "admin",
        displayName: access?.display_name || userDisplayName(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if(e instanceof PasswordChangeRequired)return NextResponse.json({mustChangePassword:true},{status:403,headers:{"Cache-Control":"no-store"}});
    return NextResponse.json(
      { error: "Atividade indisponível." },
      { status: e instanceof Unauthorized ? 401 : 503 },
    );
  }
}
