const timeFields = new Set(["data_atualizacao", "sincronizado_em", "created_at", "updated_at"]);
export function formatOrderDetailDate(key: string, value: unknown) {
  if (!value) return "—";
  const text = String(value);
  if (!timeFields.has(key)) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    return match ? match[3]+"/"+match[2]+"/"+match[1] : text;
  }
  const instant = new Date(text);
  return Number.isNaN(instant.getTime()) ? text : new Intl.DateTimeFormat("pt-BR", {
    timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",
  }).format(instant);
}
// M8's update timestamp is UTC even when the response omits the suffix.
// Use the original value, avoiding a second timezone offset from old imports.
export function m8UpdateInstant(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return null;
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value+"Z";
  const parsed = new Date(zoned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
