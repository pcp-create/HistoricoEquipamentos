export const isCancelledOrder = (status: unknown) => ["cancelado", "cancelada"].includes(String(status || "").trim().toLowerCase());
export function displayedScheduleStatus(s: any): string {
  if (isCancelledOrder(s.order_status)) return "cancelled";
  if (String(s.order_status || "").trim().toLowerCase() === "processado") return "completed";
  return s.programming_status === "completed" ? "reviewed" : s.programming_status || "pending";
}
