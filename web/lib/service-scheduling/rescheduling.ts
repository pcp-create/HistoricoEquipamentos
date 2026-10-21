export type ReschedulingEntry = {
  at: string;
  by: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  reason: string;
};
export function needsRescheduling(operation: any, next: any) {
  return !!(operation.sent_at || operation.document.firstSentAt)
    && ["awaiting_execution", "executing", "scheduled", "planning", "pending"].includes(operation.status)
    && (next.date || "") !== (operation.document.date || "");
}
/** Only persisted history is trusted; clients cannot reset or fabricate the counter. */
export function withRescheduling(operation: any, next: any, confirmation: any, actor: string, at = new Date().toISOString()) {
  const history: ReschedulingEntry[] = [...(operation.document.reschedulingHistory || [])];
  if (needsRescheduling(operation, next)) {
    if (!next.date) throw Error("Informe a nova data para reprogramar a operação.");
    if (confirmation?.confirmed !== true) throw Error("Confirme a reprogramação e informe a justificativa.");
    const reason = typeof confirmation.reason === "string" ? confirmation.reason.trim() : "";
    if (!reason || reason.length > 2000) throw Error("Informe uma justificativa de até 2.000 caracteres para a reprogramação.");
    history.push({at, by:actor, fromDate:operation.document.date || "", fromTime:operation.document.time || "",
      toDate:next.date, toTime:next.time || "", reason});
  }
  return {...next, firstSentAt:operation.document.firstSentAt || operation.sent_at || undefined, reschedulingHistory:history};
}
