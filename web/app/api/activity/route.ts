import { userModules } from "@/lib/module-access";
import { userDisplayName } from "@/lib/user-display-name";
import { NextResponse } from "next/server";
import { requireUser, sameOrigin, Unauthorized, Forbidden, PasswordChangeRequired } from "@/lib/auth";
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
        admin: access?.enabled === true && access.role === "admin",
        modules: access?.enabled === true ? userModules(access.modules) : [],
        cacheScope: user.id + ":" + (access?.role || "user") + ":" + userModules(access?.modules).join(","),
        displayName: access?.display_name || userDisplayName(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if(e instanceof PasswordChangeRequired)return NextResponse.json({mustChangePassword:true},{status:403,headers:{"Cache-Control":"no-store"}});
    return NextResponse.json(
      { error: "Atividade indisponível." },
      { status: e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503 },
    );
  }
}
