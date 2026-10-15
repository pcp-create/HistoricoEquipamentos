export function displayedScheduleStatus(s: any): string {
  if (["cancelado", "cancelada"].includes(String(s.order_status || "").trim().toLowerCase())) return "cancelled";
  if (String(s.order_status || "").trim().toLowerCase() === "processado") return "completed";
  return s.programming_status === "completed" ? "reviewed" : s.programming_status || "pending";
}
