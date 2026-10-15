import { timingSafeEqual } from "node:crypto";

const headers = { "Cache-Control": "private, no-store" };

// Shared by task notifications and the background location worker.
// Do not fall back to another token when TASK_AUTOMATION_TOKEN is configured.
export function automationAuthError(req: Request): Response | null {
  const secret = (process.env.TASK_AUTOMATION_TOKEN?.trim() ||
    process.env.PREVENTIVE_REPORT_TOKEN?.trim());
  const fail = (status: number, code: string, error: string) =>
    Response.json({ error, code }, { status, headers });
  if (!secret || secret.length < 32)
    return fail(503, "AUTOMATION_TOKEN_NOT_CONFIGURED",
      "Configure TASK_AUTOMATION_TOKEN na Vercel com pelo menos 32 caracteres e publique novamente.");
  const authorization = req.headers.get("authorization");
  if (!authorization)
    return fail(401, "AUTHORIZATION_MISSING",
      "Cabeçalho Authorization ausente. No n8n, use Header Auth com Name: Authorization e Value: Bearer seguido da chave da aplicação.");
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(authorization.trim());
  if (!match)
    return fail(401, "AUTHORIZATION_FORMAT",
      "Formato inválido. Use Authorization: Bearer seguido da chave da aplicação.");
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return fail(401, "AUTOMATION_TOKEN_MISMATCH",
      "A chave enviada não corresponde à chave de automação da aplicação. Confira TASK_AUTOMATION_TOKEN na Vercel (ou PREVENTIVE_REPORT_TOKEN quando o primeiro não estiver definido). Não use a apikey da Evolution.");
  return null;
}

export function automationAuthCheck(req: Request) {
  return automationAuthError(req) ??
    Response.json({ ok: true, authenticated: true }, { headers });
}
