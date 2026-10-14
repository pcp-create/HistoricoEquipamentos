import { database } from "@/lib/db";
import { recordActivity, accessRecord } from "@/lib/admin-store";
import { NextResponse } from "next/server";
import {
  authorizedEmail,
  requireUser,
  authRequest,
  clearSession,
  sameOrigin,
  setSession,
} from "@/lib/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action === "logout") {
      try {
        await recordActivity(await requireUser({allowPasswordChange:true}), "logout");
      } catch {
        console.error("SESSION_LOGOUT_AUDIT_UNAVAILABLE");
      }
      await clearSession();
      return NextResponse.json({ ok: true });
    }
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.email.length > 254 ||
      body.password.length > 256
    ) {
      return NextResponse.json(
        { error: "Informe seu e-mail e senha." },
        { status: 400 },
      );
    }
    const response = await authRequest("token?grant_type=password", {
      email: body.email,
      password: body.password,
    });
    if (!response.ok)
      return NextResponse.json(
        {
          error:
            response.status === 429
              ? "Muitas tentativas. Aguarde alguns minutos."
              : "E-mail ou senha inválidos, ou acesso ainda não confirmado.",
        },
        { status: response.status === 429 ? 429 : 401 },
      );
    const data = await response.json();
    if (
      !data.user?.email_confirmed_at ||
      data.user.is_anonymous ||
      !(await authorizedEmail(data.user.email))
    )
      return NextResponse.json(
        { error: "Acesso não autorizado. Consulte o administrador." },
        { status: 403 },
      );
    if (body.password === "123456") {
      const c=await database().connect();
      try {
        await c.query("BEGIN READ WRITE");
        await c.query("UPDATE web_user_access SET must_change_password=true WHERE email=$1",[data.user.email.toLowerCase()]);
        await c.query("COMMIT");
      } catch(e) {await c.query("ROLLBACK");throw e;} finally {c.release();}
    }
    await recordActivity(data.user, "login");
    await setSession(data);
    return NextResponse.json(
      { ok: true, mustChangePassword: (await accessRecord(data.user.email))?.must_change_password === true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível entrar. Tente novamente." },
      { status: 503 },
    );
  }
}
