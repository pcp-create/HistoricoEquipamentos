"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudDownload } from "lucide-react";
type Status = { online: boolean; job: null | { id: string; state: string; stage: string; message?: string; finished_at?: string } };
export default function ProjectionSyncButton({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const watched = useRef<string | null>(null);
  const completed = useRef<string | null>(null);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const accept = useCallback((data: Status) => {
    setStatus(data);
    const job = data.job;
    if (job && ["queued", "running"].includes(job.state)) watched.current = job.id;
    if (job?.state === "complete" && watched.current === job.id && completed.current !== job.id) {
      completed.current = job.id; callback.current();
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/sales-projection/sync", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!disposed) { accept(data); setError(""); }
      } catch (e) { if (!disposed) setError((e as Error).message); }
      if (!disposed) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [accept]);
  const active = !!status?.job && ["queued", "running"].includes(status.job.state);
  async function start() {
    setSending(true); setError("");
    try {
      const response = await fetch("/api/sales-projection/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      accept(data);
    } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  }
  return <div className="projection-sync-control">
    <button className="button primary" onClick={start} disabled={sending || active || !status?.online}>
      <CloudDownload size={16} aria-hidden="true"/>{sending ? "Solicitando…" : active ? "Sincronizando…" : "Sincronizar com ERP"}
    </button>
    <small role={error || status?.job?.state === "failed" ? "alert" : "status"}>
      {error || (active ? (status?.online ? status.job!.stage : "Integrador sem comunicação. A solicitação será conferida quando ele retornar.") :
        status?.job?.state === "failed" ? status.job.message :
        status?.online === false ? "Integrador manual não está ativo no servidor." :
        status?.job?.state === "complete" ? "Última sincronização concluída: " + new Date(status.job.finished_at!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "")}
    </small>
  </div>;
}
