import { sessionTotals } from "./field-model";

export function timeLogs(
  sessions: any[],
  events: any[],
  operationEvents: any[],
  now = Date.now(),
) {
  const rows = sessions.map((original) => {
    const s = { ...original, ...original.correction };
    const totals = sessionTotals(s, now);
    const pauses: any[] = [];
    let pending: any = null;
    for (const e of events
      .filter((e) => e.document?.sessionId === s.id)
      .sort(
        (a, b) =>
          Date.parse(a.created_at) - Date.parse(b.created_at) ||
          Number(a.id) - Number(b.id),
      )) {
      if (e.action === "pause") pending = e;
      if ((e.action === "resume" || e.action === "stop") && pending) {
        pauses.push({
          start: pending.created_at,
          end: e.created_at,
          startLocation: pending,
          endLocation: e,
          reason: pending.document.reason?.name || "Pausa",
          seconds: Math.max(
            0,
            (Date.parse(e.created_at) - Date.parse(pending.created_at)) / 1000,
          ),
        });
        pending = null;
      }
    }
    if (pending)
      pauses.push({
        startLocation: pending,
        start: pending.created_at,
        end: s.finished_at || null,
        reason: pending.document.reason?.name || "Pausa",
        seconds: Math.max(
          0,
          ((s.finished_at ? Date.parse(s.finished_at) : now) -
            Date.parse(pending.created_at)) /
            1000,
        ),
      });
    const sessionEvents = events.filter((e) => e.document?.sessionId === s.id);
    return {
      ...s,
      active: totals.active,
      pause: totals.pause,
      total: totals.active + totals.pause,
      pauses: s.correction?.pauses || pauses,
      manual: false,
      startLocation: sessionEvents.find(
        (e) => e.action === "start_work" || e.action === "start_travel",
      ),
      endLocation: sessionEvents.find((e) => e.action === "stop"),
      adjusted: !!s.correction,
      originalPauses: s.correction ? pauses : undefined,
    };
  });
  // Mobile stop events mirror sessions for costing; count those only once.
  for (const e of operationEvents.filter(
    (e) => e.action === "work_log" || e.action === "travel_log",
  )) {
    const kind = e.action === "travel_log" ? "travel" : "work";
    if (
      sessions.some(
        (s) =>
          String(s.legacy_event_id) === String(e.id) ||
          (s.operation_id === e.operation_id &&
            s.actor === e.actor &&
            s.kind === kind &&
            s.finished_at &&
            Date.parse(s.finished_at) === Date.parse(e.created_at)),
      )
    )
      continue;
    rows.push({
      ...e,
      legacyEventId: e.id,
      id: "manual-" + e.id,
      kind,
      state: "finished",
      started_at: null,
      finished_at: null,
      recorded_at: e.created_at,
      active: Number(e.hours || 0) * 3600,
      pause: 0,
      total: Number(e.hours || 0) * 3600,
      pauses: [],
      manual: true,
    });
  }
  rows.sort(
    (a, b) =>
      Date.parse(b.started_at || b.recorded_at) -
      Date.parse(a.started_at || a.recorded_at),
  );
  const summary = {
    count: rows.length,
    people: new Set(rows.map((r) => r.actor)).size,
    travel: 0,
    work: 0,
    pause: 0,
    total: 0,
  };
  for (const r of rows) {
    summary[r.kind === "travel" ? "travel" : "work"] += r.active;
    summary.pause += r.pause;
    summary.total += r.total;
  }
  return { rows, summary };
}
export function elapsedTime(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
