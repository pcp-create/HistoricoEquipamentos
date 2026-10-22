import "server-only";
export class M8RequestError extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
  }
}
// Authenticate before reserving a write. POST requests are deliberately never retried.
export async function m8Session(
  company: number,
  transport: typeof fetch = fetch,
) {
  if (![1, 2, 27404].includes(company)) throw new Error("Empresa inválida.");
  const base = (
    process.env.M8_API_URL ||
    process.env.M8_BASE_URL ||
    "https://api.integra.m8sistemas.com.br"
  ).replace(/\/+$/, "");
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Endereço M8 inválido.");
  const required = (name: string) => {
    const value = process.env[name];
    if (!value?.trim()) throw new Error("Integração M8 não configurada.");
    return value;
  };
  const auth = await transport(base + "/v1/auth/token", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant: required("M8_TENANT"),
      username: required("M8_USERNAME"),
      password: required("M8_PASSWORD"),
      company,
      domain: process.env.M8_DOMAIN || "app.erpm8.cloud",
    }),
  });
  if (!auth.ok) throw new Error("Não foi possível autenticar no M8.");
  const a = await auth.json();
  if (a.errors?.length || !a.data?.token)
    throw new Error("Autenticação M8 inválida.");
  return async (
    path: string,
    body?: unknown,
    method: "POST" | "PATCH" = "POST",
  ) => {
    if (!path.startsWith("/v1/") || path.includes(".."))
      throw new Error("Endpoint inválido.");
    let response: Response;
    try {
      response = await transport(base + path, {
        method: body === undefined ? "GET" : method,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${a.data.token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new M8RequestError(
        "O M8 não confirmou a resposta. Confira o resultado no ERP antes de qualquer novo envio.",
        body !== undefined,
      );
    }
    if (!response.ok) {
      let detail = "";
      if ([400, 422].includes(response.status)) {
        try {
          const error = await response.json();
          const messages = [
            ...(Array.isArray(error.errors) ? error.errors : []),
            error.data,
          ]
            .map((r) => r?.message)
            .filter((v): v is string => typeof v === "string");
          detail = messages.join(" · ").slice(0, 1200);
        } catch {}
      }
      throw new M8RequestError(
        `O M8 respondeu HTTP ${response.status}. ${detail || "Confira os cadastros e os campos informados."}`,
        body !== undefined && ![400, 401, 403, 422].includes(response.status),
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new M8RequestError(
        "Resposta M8 inválida; confira o resultado no ERP.",
        body !== undefined,
      );
    }
    if (!result || typeof result !== "object" || !("data" in result))
      throw new M8RequestError(
        "Resposta M8 sem confirmação válida. Confira o resultado no ERP.",
        body !== undefined,
      );
    if (result.errors?.length)
      throw new M8RequestError(
        "O M8 retornou erros de validação. Confira os campos e os IDs dos cadastros.",
        body !== undefined,
      );
    return result.data;
  };
}
