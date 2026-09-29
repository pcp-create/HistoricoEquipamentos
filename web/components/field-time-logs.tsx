"use client";
import { useEffect, useState } from "react";
import ScheduleTimeLogs from "./schedule-time-logs";
export default function FieldTimeLogs({ operationId }: { operationId: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    const r = await fetch("/api/field/time-requests", { cache: "no-store" }),
      b = await r.json();
    if (!r.ok) throw Error(b.error);
    const belongs = (row: any) => String(row.operation_id) === String(operationId);
    const sessions = (b.fieldSessions || []).filter(belongs);
    const sessionIds = new Set(sessions.map((row: any) => row.id));
    setData({
      ...b,
      operations: (b.operations || []).filter((row: any) => String(row.id) === String(operationId)),
      fieldSessions: sessions,
      fieldEvents: (b.fieldEvents || []).filter((row: any) => belongs(row) || sessionIds.has(row.document?.sessionId)),
      events: (b.events || []).filter(belongs),
      requests: (b.requests || []).filter(belongs),
    });
    setError("");
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [operationId]);
  return (
    <section className="field-time-logs">
      <h2>Apontamentos da operação</h2>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <ScheduleTimeLogs data={data} technician onChanged={load} />
      ) : (
        !error && <p>Carregando apontamentos…</p>
      )}
    </section>
  );
}
