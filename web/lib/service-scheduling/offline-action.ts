/** Device timestamps are accepted only through authenticated, idempotent replay. */
export function offlineTime(value: unknown, now = Date.now()) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    Date.parse(value) > now + 300000 ||
    Date.parse(value) < now - 30 * 86400000
  )
    throw Error(
      "Horário offline inválido ou anterior a 30 dias. Solicite a conferência do apontamento.",
    );
  return new Date(value).toISOString();
}
