"use client";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi, X, Download } from "lucide-react";
import "./field-offline.css";
type SyncState = {
  connected: boolean | null;
  pending: number;
  queue: {
    id: string;
    action: string;
    operationId: string;
    operationLabel?: string;
    at: string;
    error?: string;
  }[];
  prepared?: string;
  lastSync?: string;
  error?: string;
};
let state: SyncState = { connected: null, pending: 0, queue: [] };
const listeners = new Set<(state: SyncState) => void>();
const update = (next: Partial<SyncState>) => {
  state = { ...state, ...next };
  for (const fn of listeners) fn(state);
};
export async function offlineMessage(type: string): Promise<any> {
  const worker = navigator.serviceWorker?.controller;
  if (!worker)
    throw Error(
      "O modo offline ainda está sendo preparado. Aguarde e tente novamente.",
    );
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(
      () =>
        reject(
          Error(
            "A sincronização continua em andamento. Consulte os pendentes.",
          ),
        ),
      180000,
    );
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      if (!event.data.backup) update(event.data);
      resolve(event.data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}
function useSyncState() {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    setValue(state);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
export function FieldConnection() {
  const status = useSyncState();
  return (
    <div
      className={
        "field-connection " +
        (status.connected === null
          ? "checking"
          : status.connected
            ? "connected"
            : "disconnected")
      }
      role="status"
    >
      {status.connected ? <Wifi size={14} /> : <CloudOff size={14} />}
      <strong>
        {status.connected === null
          ? "Verificando conexão"
          : status.connected
            ? "Conectado"
            : "Sem internet"}
      </strong>
      {status.pending > 0 && (
        <span>
          {status.pending} pendente{status.pending === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
const names: Record<string, string> = {
  start_work: "Início de atividade",
  start_travel: "Início de deslocamento",
  stop: "Finalização do apontamento",
  pause: "Pausa",
  resume: "Retomada",
  pause_ack: "Confirmação da pausa",
  report_save: "Relatório salvo",
  report_send: "Envio do relatório",
  report_send_partial: "Envio parcial",
  report_return: "Devolução do relatório",
  finish_full: "Finalização da operação",
  materials: "Conferência de peças",
  info_read: "Leitura das informações",
  checklist_save: "Etapa do relatório",
  checklist_submit: "Envio da etapa",
  request: "Solicitação de ajuste",
};
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Ainda não realizada";
export default function FieldOffline({ onSynced }: { onSynced: () => void }) {
  const status = useSyncState();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setError("Este navegador não oferece armazenamento offline.");
      return;
    }
    let disposed = false;
    const refresh = () => {
      void offlineMessage("FIELD_STATUS").catch(() => {});
    };
    const sync = () => {
      if (navigator.onLine)
        void offlineMessage(
          state.prepared ? "FIELD_SYNC" : "FIELD_PREPARE",
        ).catch(() => {});
      else update({ connected: false });
    };
    const changed = (event: MessageEvent) => {
      if (event.data?.type === "field-offline-update") {
        refresh();
        onSynced();
      }
    };
    const init = async () => {
      await navigator.serviceWorker.register("/field-offline/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          ),
        );
      if (disposed) return;
      await fetch("/api/field", { cache: "no-store" });
      await navigator.storage?.persist?.();
      await offlineMessage("FIELD_STATUS");
      if (navigator.onLine) {
        setBusy(true);
        const result = await offlineMessage("FIELD_PREPARE");
        if (!result.ok) setError(result.error);
        setBusy(false);
      } else sync();
    };
    void init().catch((e) => {
      if (!disposed) {
        setError(e.message);
        setBusy(false);
      }
    });
    navigator.serviceWorker.addEventListener("message", changed);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const visibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(sync, 30000);
    return () => {
      disposed = true;
      clearInterval(timer);
      navigator.serviceWorker.removeEventListener("message", changed);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  async function exportPending() {
    try {
      const result = await offlineMessage("FIELD_EXPORT");
      if (!result.ok) throw Error(result.error);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.backup)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download =
        "rj-tecnico-pendencias-" +
        new Date().toISOString().slice(0, 10) +
        ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run(type: string) {
    setBusy(true);
    setError("");
    try {
      const result = await offlineMessage(type);
      if (!result.ok) setError(result.error);
      onSynced();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <FieldConnection />
      <button className="field-sync-entry" onClick={() => setOpen(true)}>
        <RefreshCw size={16} />
        <span>
          Sincronismo
          {status.pending
            ? " · " +
              status.pending +
              (status.pending === 1 ? " pendente" : " pendentes")
            : ""}
        </span>
        {busy && <small>Preparando…</small>}
      </button>
      {!status.prepared && (
        <p className="field-offline-hint">
          {busy
            ? "Baixando a programação para uso offline…"
            : "Prepare este dispositivo com internet antes de trabalhar offline."}
        </p>
      )}
      {error && !open && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <div className="field-sync-backdrop">
          <section
            className="field-sync-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Sincronismo"
          >
            <header>
              <h2>Sincronismo</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar sincronismo"
              >
                <X />
              </button>
            </header>
            <FieldConnection />
            <p>
              <b>{status.pending}</b>{" "}
              {status.pending === 1
                ? "registro aguardando"
                : "registros aguardando"}{" "}
              envio
            </p>
            <dl>
              <dt>Programação baixada</dt>
              <dd>{date(status.prepared)}</dd>
              <dt>Último envio confirmado</dt>
              <dd>{date(status.lastSync)}</dd>
            </dl>
            <p>
              Os registros ficam neste dispositivo até o sistema confirmar o
              recebimento. Salve o relatório para incluí-lo na fila.
            </p>
            <div className="field-sync-actions">
              <button
                disabled={busy || status.connected === false}
                onClick={() => void run("FIELD_SYNC")}
              >
                <RefreshCw size={16} />
                Sincronizar agora
              </button>
              <button
                disabled={busy || status.pending > 0}
                onClick={() => void run("FIELD_PREPARE")}
              >
                <Download size={16} />
                Baixar programação
              </button>
            </div>
            {busy && (
              <p role="status">Sincronizando… Mantenha o aplicativo aberto.</p>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <ul>
              {status.queue.map((item) => (
                <li key={item.id}>
                  <b>{names[item.action] || item.action}</b>
                  <small>
                    {item.operationLabel} · {date(item.at)}
                  </small>
                  {item.error && <p role="alert">{item.error}</p>}
                </li>
              ))}
            </ul>
            {status.pending > 0 && (
              <button onClick={() => void exportPending()}>
                Baixar cópia das pendências
              </button>
            )}
            {status.queue.some((item) =>
              item.error?.includes("Entre novamente"),
            ) && (
              <a href="/login?next=%2Ftecnico">
                Entrar novamente para sincronizar
              </a>
            )}
            {status.pending === 0 && (
              <p className="field-success">
                Nenhum registro pendente de envio.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
