// Only fixed diagnostic codes may reach logs or responses; never raw database errors.
const allowed = new Set([
  "28P01", "28000", "42501", "42P01", "42703", "57014", "53300",
  "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "ENOTFOUND", "ECONNRESET",
  "ENOENT", "ERR_INVALID_URL", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID",
]);
export function dataErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "DATA_QUERY_FAILED";
  if (error.message === "Banco não configurado") return "DATABASE_URL_MISSING";
  if (error.message === "Configure TLS pelo certificado") return "DATABASE_URL_SSL_PARAMETERS";
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === "string" && allowed.has(code)) return code;
  if (/timeout|timed out/i.test(error.message)) return "DATABASE_TIMEOUT";
  return "DATA_QUERY_FAILED";
}
export function logDataError(scope: string, error: unknown): string {
  const code = dataErrorCode(error);
  console.error(JSON.stringify({ scope, code }));
  return code;
}
