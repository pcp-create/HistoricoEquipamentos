const dayInBrazil = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
export function fieldOperationOverdue(
  date: string | null | undefined,
  status: string,
  now: number,
) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (["awaiting_review", "reviewed", "completed"].includes(status)) return false;
  return date < dayInBrazil.format(new Date(now));
}
