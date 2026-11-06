export const isCancelledOrder = (status: unknown) =>
  ["cancelado", "cancelada"].includes(
    String(status || "")
      .trim()
      .toLowerCase(),
  );
const processed = (s: any) =>
  String(s.order_status || "")
    .trim()
    .toLowerCase() === "processado";
export function displayedScheduleStatus(s: any): string {
  if (isCancelledOrder(s.order_status)) return "cancelled";
  if (processed(s)) return "completed";
  if (
    ["reviewed", "completed", "release_pending"].includes(s.programming_status)
  )
    return "reviewed";
  return s.programming_status || "pending";
}
/** Review is complete independently of the later ERP release step. */
export function displayedOperationStatus(s: any, status: string): string {
  if (!["reviewed", "completed"].includes(status)) return status;
  if (processed(s)) return "completed";
  return "reviewed";
}
export function displayedOperationCounts(
  s: any,
  counts: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [status, count] of Object.entries(counts)) {
    const stage = displayedOperationStatus(s, status);
    result[stage] = (result[stage] || 0) + Number(count);
  }
  return result;
}
