import "server-only";
import { cookies, headers } from "next/headers";

export class Unauthorized extends Error {}
export function allowedEmail(email: unknown) {
  return (
    typeof email === "string" &&
    (process.env.WEB_ALLOWED_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase())
  );
}
function settings() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Autenticação não configurada");
  return { url, key };
}
export async function authRequest(
  endpoint: string,
  body?: object,
  token?: string,
) {
  const { url, key } = settings();
  return fetch(`${url}/auth/v1/${endpoint}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
export async function setSession(data: {
  access_token: string;
  refresh_token: string;
}) {
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    secure: secureSessionCookie(await headers()),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
  jar.set("m8-access", data.access_token, opts);
  jar.set("m8-refresh", data.refresh_token, opts);
}
export async function clearSession() {
  const jar = await cookies();
  jar.delete("m8-access");
  jar.delete("m8-refresh");
}
// Called only in route handlers: refresh can update HttpOnly cookies.
export async function requireUser() {
  const jar = await cookies();
  const token = jar.get("m8-access")?.value;
  if (token) {
    const response = await authRequest("user", undefined, token);
    if (response.ok) {
      const user = await response.json();
      if (
        user.id &&
        !user.is_anonymous &&
        user.email_confirmed_at &&
        allowedEmail(user.email)
      )
        return user as { id: string; email: string };
      throw new Unauthorized();
    }
    if (response.status !== 401 && response.status !== 403)
      throw new Error("Autenticação indisponível");
  }
  const refresh = jar.get("m8-refresh")?.value;
  if (refresh) {
    const response = await authRequest("token?grant_type=refresh_token", {
      refresh_token: refresh,
    });
    if (response.ok) {
      const data = await response.json();
      if (
        data.user?.id &&
        !data.user.is_anonymous &&
        data.user.email_confirmed_at &&
        allowedEmail(data.user.email)
      ) {
        await setSession(data);
        return data.user as { id: string; email: string };
      }
    }
  }
  throw new Unauthorized();
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    // Vercel/Codespaces terminate TLS at the proxy; request.url can use an internal host.
    const expectedHost =
      request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
      request.headers.get("host") ||
      new URL(request.url).host;
    const source = new URL(origin);
    return (
      source.host === expectedHost &&
      (source.protocol === "https:" ||
        (isLoopback(source.hostname) && source.protocol === "http:"))
    );
  } catch {
    return false;
  }
}

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function secureSessionCookie(requestHeaders: Pick<Headers, "get">) {
  // HTTP cookies are only permitted for loopback development/preview.
  // A remote HTTPS origin must stay Secure even if its proxy uses local HTTP.
  try {
    const origin = requestHeaders.get("origin");
    if (origin) {
      const source = new URL(origin);
      return !(source.protocol === "http:" && isLoopback(source.hostname));
    }
    const host =
      requestHeaders.get("x-forwarded-host")?.split(",")[0].trim() ||
      requestHeaders.get("host");
    const protocol = requestHeaders
      .get("x-forwarded-proto")
      ?.split(",")[0]
      .trim();
    if (!host || (protocol && protocol !== "http")) return true;
    return !isLoopback(new URL(`http://${host}`).hostname);
  } catch {
    return true;
  }
}
