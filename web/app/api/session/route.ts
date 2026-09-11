import { NextResponse } from "next/server";
import {
  allowedEmail,
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
      !allowedEmail(data.user.email)
    )
      return NextResponse.json(
        { error: "Acesso não autorizado. Consulte o administrador." },
        { status: 403 },
      );
    await setSession(data);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível entrar. Tente novamente." },
      { status: 503 },
    );
  }
}
