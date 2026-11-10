"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi, X, Download, AlertTriangle, LogOut, LoaderCircle, Trash2 } from "lucide-react";
import "./field-offline.css";
import { nativePortal } from "@/lib/native-portal";
type SyncState = {
  connected: boolean | null;
  serverConnected?: boolean;
  pending: number;
  queue: {
    id: string;
    action: string;
    operationId: string;
    operationLabel?: string;
    at: string;
    error?: string;
    blockedReason?:string;
    dependents?:number;
    canRetry?:boolean;
  }[];
  prepared?: string;
  discarded?:number;
  syncing?: boolean;
  syncingId?: string;
  lastSync?: string;
  error?: string;
};
let state: SyncState = { connected: null, pending: 0, queue: [] };
const listeners = new Set<(state: SyncState) => void>();
const update = (next: Partial<SyncState>) => {
  state = { ...state, ...next };
  for (const fn of listeners) fn(state);
};
export async function offlineMessage(type: string,payload:Record<string,unknown>={}): Promise<any> {
  if (nativePortal()) {
    const result = await nativePortal()!.message(type,payload);
    if (!result.backup) update(result);
    return result;
  }
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
    worker.postMessage({ ...payload,type }, [channel.port2]);
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
export const FieldSessionActions = createContext<{signOut: () => void; signingOut: boolean} | null>(null);
const localDay=(value:string)=>new Date(value).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
export function FieldSyncIcon(){
  const status=useSyncState();
  const stale=!!nativePortal()&&(!status.prepared||localDay(status.prepared)!==localDay(new Date().toISOString()));
  return <span className="field-sync-icon"><RefreshCw size={18} className={status.syncing?"spin":""}/>{stale&&<AlertTriangle size={12} className="field-sync-warning" aria-label="Atualize a programação baixada"/>}</span>;
}
export function FieldConnection({showExit=true}:{showExit?:boolean}={}) {
  const session = useContext(FieldSessionActions);
  const status = useSyncState();
  const serverUnavailable=status.connected===true&&status.serverConnected===false;
  return (
    <div
      className={
        "field-connection " +
        (status.connected === null || serverUnavailable
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
          : serverUnavailable
            ? "Internet disponível · sem acesso ao sistema"
            : status.connected
            ? "Conectado"
            : "Sem internet"}
      </strong>
      {(status.pending > 0 || !!status.discarded) && (
        <span>
          {status.syncing&&<RefreshCw size={13} className="spin" aria-label="Sincronizando"/>} {status.pending} pendente{status.pending === 1 ? "" : "s"}
        </span>
      )}
      {session && showExit && <button type="button" className="field-connection-exit" onClick={session.signOut} disabled={session.signingOut} aria-label={session.signingOut ? "Saindo…" : "Sair"}>{session.signingOut ? <LoaderCircle size={13} className="spin"/> : <LogOut size={13}/>} {session.signingOut ? "Saindo…" : "Sair"}</button>}
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
export default function FieldOffline({
  onSynced,
  open,
  onClose,
}: {
  onSynced: () => void;
  open: boolean;
  onClose: () => void;
}) {
  const status = useSyncState();
  const [discarding,setDiscarding]=useState<SyncState['queue'][number]|null>(null),[discardDependents,setDiscardDependents]=useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (nativePortal()) {
      let refreshTimer:ReturnType<typeof setTimeout>|undefined;
      let observedSync=state.lastSync,observedPending=state.pending;
      const changed = () => {
        if(refreshTimer)clearTimeout(refreshTimer);
        refreshTimer=setTimeout(()=>{
          void offlineMessage("FIELD_STATUS").then(result=>{
            if(result.lastSync!==observedSync||result.pending<observedPending||(!result.syncing&&result.serverConnected!==false))onSynced();
            observedSync=result.lastSync;observedPending=result.pending;
          }).catch(()=>{});
        },200);
      };
      const sync = async () => {
        const connected = await nativePortal()!.connection().catch(() => false);
        update({connected});
        if (!connected) {
          update({ connected: false });
          return;
        }
        void offlineMessage(
          state.prepared ? "FIELD_SYNC" : "FIELD_PREPARE",
        ).catch(() => {});
      };
      window.addEventListener("rj-offline-update", changed);
      window.addEventListener("rj-network-change", sync);
      window.addEventListener("online", sync);
      window.addEventListener("offline", sync);
      const visibility = () => {
        if (document.visibilityState === "visible") sync();
      };
      document.addEventListener("visibilitychange", visibility);
      void fetch("/api/field")
        .then(() => offlineMessage("FIELD_STATUS"))
        .then(sync)
        .catch(() => {});
      const timer = setInterval(sync, 30000);
      return () => {
        clearInterval(timer);
        if(refreshTimer)clearTimeout(refreshTimer);
        window.removeEventListener("rj-offline-update", changed);
        window.removeEventListener("rj-network-change", sync);
        window.removeEventListener("online", sync);
        window.removeEventListener("offline", sync);
        document.removeEventListener("visibilitychange", visibility);
      };
    }
    let disposed = false;
    const sync = async () => {
      update({ connected: navigator.onLine });
      if (navigator.serviceWorker?.controller && navigator.onLine) {
        try { await offlineMessage("FIELD_WEB_INIT"); } catch { return; }
        // Legacy records remain recoverable; never download or queue new web work.
        if (navigator.onLine && state.pending > 0) await offlineMessage("FIELD_SYNC").catch(() => {});
      }
      update({ connected: navigator.onLine });
    };
    const changed = (event: MessageEvent) => {
      if (event.data?.type === "field-offline-update") {
        void offlineMessage("FIELD_STATUS").then(() => update({connected:navigator.onLine})).catch(() => {});
        onSynced();
      }
    };
    const init = async () => {
      // Upgrade existing installations so their old worker stops intercepting
      // submissions. Do not install offline support for new web users.
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          if (registration.active?.scriptURL.endsWith("/field-offline/sw.js")) await registration.update();
        }
      }
      if (!disposed) await sync();
    };
    void init().catch(() => update({connected:navigator.onLine}));
    navigator.serviceWorker?.addEventListener("message", changed);
    navigator.serviceWorker?.addEventListener("controllerchange", sync);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const timer = setInterval(sync, 30000);
    return () => {
      disposed = true;
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener("message", changed);
      navigator.serviceWorker?.removeEventListener("controllerchange", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  async function exportPending() {
    try {
      const result = await offlineMessage("FIELD_EXPORT");
      if (!result.ok) throw Error(result.error);
      if (nativePortal()) {
        await nativePortal()!.exportBackup(JSON.stringify(result.backup));
        return;
      }
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
      {nativePortal() && status.connected && status.serverConnected === false && <p className="field-offline-hint">Internet conectada. O sistema ainda não está disponível para sincronizar; seus registros permanecem salvos.</p>}
      {nativePortal()&&status.prepared&&localDay(status.prepared)!==localDay(new Date().toISOString())&&<p className="field-download-warning" role="status"><AlertTriangle size={16}/> Programação baixada em {date(status.prepared)}. Atualize a programação de hoje.</p>}
      {nativePortal() && !status.prepared && (
        <p className="field-offline-hint"><AlertTriangle size={16}/>
          {busy
            ? "Baixando a programação para uso offline…"
            : "Prepare este dispositivo com internet antes de trabalhar offline."}
        </p>
      )}
      {!nativePortal() && status.connected === false && <p className="field-error" role="alert">O portal web funciona somente online. Reconecte à internet para salvar ou enviar informações.</p>}
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
              <h2>{nativePortal() ? "Sincronismo" : "Conexão e pendências anteriores"}</h2>
              <button onClick={onClose} aria-label="Fechar sincronismo">
                <X />
              </button>
            </header>
            <FieldConnection showExit={false}/>
            <p>
              <b>{status.pending}</b>{" "}
              {status.pending === 1
                ? "registro aguardando"
                : "registros aguardando"}{" "}
              envio
            </p>
            {nativePortal() && <dl>
              <dt>Programação baixada</dt>
              <dd>{date(status.prepared)}</dd>
              <dt>Último envio confirmado</dt>
              <dd>{date(status.lastSync)}</dd>
            </dl>}
            <p>
              {nativePortal() ? "Os registros ficam neste dispositivo até o sistema confirmar o recebimento. Salve o relatório para incluí-lo na fila." : "O portal web funciona somente online. Pendências de versões anteriores permanecem disponíveis para envio ou cópia de segurança."}
            </p>
            <div className="field-sync-actions">
              <button
                disabled={busy || status.syncing || status.connected === false}
                onClick={() => { if (!nativePortal() && !status.pending) { onSynced(); onClose(); } else void run("FIELD_SYNC"); }}
              >
                <RefreshCw size={16} />
                {nativePortal() || status.pending ? "Sincronizar agora" : "Atualizar programação"}
              </button>
              {nativePortal() && <button
                disabled={busy || status.syncing || status.connected === false}
                onClick={() => void run("FIELD_PREPARE")}
              >
                <Download size={16} />
                Baixar programação
              </button>}
            </div>
            {busy && (
              <p role="status">Sincronizando… Mantenha o aplicativo aberto.</p>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            {status.queue.some(item=>item.error||item.blockedReason)&&<p className="field-sync-notice">Falhas não bloqueiam o envio de registros independentes nem a chegada de novas OSs. Registros que dependem de uma falha permanecem protegidos.</p>}
            {discarding&&<section role="alertdialog" aria-label="Excluir pendência de envio" className="field-sync-discard-confirm">
              <strong>Excluir esta pendência de envio?</strong><p>{names[discarding.action]||discarding.action} · {discarding.operationLabel}</p>
              <p>Este registro sairá da fila e não será enviado. Uma cópia local continuará disponível em Baixar cópia das pendências. Isso não exclui informações já recebidas pelo servidor.</p>
              {!!discarding.dependents&&<><p>Há {discarding.dependents} registro(s) dependente(s). Se excluir somente este, os dependentes permanecerão bloqueados para conferência.</p><label><input type="checkbox" checked={discardDependents} disabled={busy} onChange={e=>setDiscardDependents(e.target.checked)}/>Excluir também os {discarding.dependents} registros dependentes</label></>}
              <div><button type="button" disabled={busy} onClick={()=>setDiscarding(null)}>Cancelar exclusão</button><button type="button" disabled={busy||status.syncing} onClick={async()=>{setBusy(true);setError('');try{const result=await offlineMessage('FIELD_DISCARD',{id:discarding.id,includeDependents:discardDependents});if(!result.ok)throw Error(result.error);setDiscarding(null);onSynced();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Confirmar exclusão</button></div>
            </section>}
            <ul>
              {status.queue.map((item) => (
                <li key={item.id}>
                  <b>{status.syncingId===item.id&&<RefreshCw className="spin" size={15} aria-label="Enviando este registro"/>} {names[item.action] || item.action}</b>
                  <small>
                    {item.operationLabel} · {date(item.at)}
                  </small>
                  {(item.error||item.blockedReason)&&<><p role="alert">{item.error||item.blockedReason}</p>{item.canRetry&&<button type="button" disabled={busy||status.syncing} onClick={async()=>{setBusy(true);setError('');try{const result=await offlineMessage('FIELD_RETRY',{id:item.id});if(!result.ok)throw Error(result.error);onSynced();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><RefreshCw size={15}/>Reprocessar este registro</button>}<button type="button" className="field-sync-discard" disabled={busy||status.syncing} onClick={()=>{setDiscarding(item);setDiscardDependents(false);}}><Trash2 size={15}/>Excluir pendência</button></>}
                </li>
              ))}
            </ul>
            {(status.pending > 0 || !!status.discarded) && (
              <button onClick={() => void exportPending()}>
                Baixar cópia das pendências
              </button>
            )}
            {status.queue.some((item) =>
              item.error?.includes("Entre novamente"),
            ) && (
              <a href="/tecnico/entrar">Entrar novamente para sincronizar</a>
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
