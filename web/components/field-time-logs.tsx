"use client";
import { useEffect, useState } from "react";
import ScheduleTimeLogs from "./schedule-time-logs";
export default function FieldTimeLogs() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    const r = await fetch("/api/field/time-requests", { cache: "no-store" }),
      b = await r.json();
    if (!r.ok) throw Error(b.error);
    setData(b);
    setError("");
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  return (
    <section>
      <h2>Meus apontamentos</h2>
      <button onClick={() => void load().catch((e) => setError(e.message))}>
        Atualizar
      </button>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <ScheduleTimeLogs data={data} technician onChanged={load} />
      ) : (
        !error && <p>Carregando apontamentos…</p>
      )}
    </section>
  );
}
