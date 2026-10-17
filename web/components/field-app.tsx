"use client";
import { nativePortal } from "@/lib/native-portal";
import FieldPdfButton from "./field-pdf-button";
import FieldOffline, {FieldSessionActions,FieldSyncIcon} from "./field-offline";
import { clearApiCache } from "@/lib/client-api-cache";
import { materialBalance } from "@/lib/service-scheduling/material-balance";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { useState, useEffect, useId, useRef } from "react";
import {
  ArrowLeft,
  Settings,
  LoaderCircle,
  CalendarDays,
  Wallet,
  Handshake,
  Info,
  Package,
  ClipboardList,
  Flag,
  Car,
  Play,
  Pause,
  Square,
  Wrench,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  MapPin,
  Clock3,
} from "lucide-react";
import {stagesOf,groupsOf} from '@/lib/service-scheduling/checklists';
import {checklistProgress} from '@/lib/service-scheduling/checklist-progress';
import SaveActionIcon from "./save-action-icon";
import FieldMap, { useAutomaticFieldLocation } from "./field-map";
import FieldTimeLogs from "./field-time-logs";
import FieldCalendar, { fieldToday } from "./field-calendar";
import { fieldOperationOverdue } from "@/lib/service-scheduling/field-overdue";
import FieldReportScreen from "./field-report-screen";
import ScheduleChecklistRun from "./schedule-checklist-run";
import { statusNames } from "@/lib/service-scheduling/model";
import { sessionTotals } from "@/lib/service-scheduling/field-model";
import "./field-app.css";
async function api(url = "/api/field", body?: any) {
  const r = await fetch(url, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Não foi possível salvar.");
  return data;
}
let recentPosition:any=null;
let pendingPosition:Promise<any>|null=null;
function position():Promise<any> {
  if(recentPosition&&Date.now()-Date.parse(recentPosition.at)<30000)return Promise.resolve(recentPosition);
  if(pendingPosition)return pendingPosition;
  pendingPosition=capturePosition().then(value=>{recentPosition=value;return value}).finally(()=>{pendingPosition=null});
  return pendingPosition;
}
async function capturePosition() {
  if (!navigator.geolocation)
    throw Error(
      "Este navegador não oferece localização. Use um navegador atualizado.",
    );
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          at: new Date(p.timestamp).toISOString(),
        }),
      (error) =>
        reject(
          Error(
            nativePortal() ? error.message : error.code === 1 ? "Permita a localização do aparelho e tente novamente. O registro ainda não foi salvo." : "Não foi possível obter uma posição recente. Verifique o sinal GPS e tente novamente. O registro ainda não foi salvo.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    ),
  );
}
const when = (date: string, time?: string) =>
  date
    ? date.split("-").reverse().join("/") + (time ? " às " + time : "")
    : "Sem data";
function plannedDuration(value: unknown) {
  if (value == null || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) return "Não informada";
  const minutes = Math.round(Number(value) * 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? hours + " h" + (rest ? " " + rest + " min" : "") : minutes + " min";
}
const elapsed = (seconds: number) => {
  const n = Math.floor(seconds);
  return `${String(Math.floor(n / 3600)).padStart(2, "0")}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
export default function FieldApp() {
  const orderAccordionName = useId();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      if (!navigator.onLine) throw Error("Conecte à internet para sair da sua conta. Seus registros pendentes continuam salvos neste dispositivo.");
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error("Não foi possível sair. Tente novamente.");
      clearApiCache();
      window.location.replace("/tecnico/entrar");
    } catch (e) {
      setError(e instanceof Error && e.name === "Error" ? e.message : "Não foi possível sair. Verifique a conexão e tente novamente.");
      setSigningOut(false);
    }
  }
  const [openOperation, setOpenOperation] = useState<string | null>(null);
  useEffect(() => {
    const open = () => { nativePortal()?.launchOperation().then(id => { if(id){setScreen("schedule");setScheduleView("list");setOpenOperation(id);} }).catch(() => {}); };
    open();window.addEventListener("rj-open-operation",open);
    return () => window.removeEventListener("rj-open-operation",open);
  }, []);
  const [scheduleView, setScheduleView] = useState("list");
  const [includeClosed,setIncludeClosed]=useState(false);
  const [selectedDay, setSelectedDay] = useState(() => fieldToday(Date.now()));
  const [screen, setScreen] = useState("home"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [syncOpen, setSyncOpen] = useState(false),
    [now, setNow] = useState(Date.now());
  const locationMessage = useAutomaticFieldLocation(data?.isTechnician === true);
  async function refresh() {
    try {
      setData(await api());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), 20000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);
  const groups = new Map<string, any[]>();
  for (const row of ((scheduleView === "calendar" || includeClosed) ? data?.calendarRows || data?.rows : data?.rows) || []) {
    const k = String(row.schedule_id);
    groups.set(k, [...(groups.get(k) || []), row]);
  }
  for (const rows of groups.values()) rows.sort((a,b)=>Number(a.position)-Number(b.position));
  const active = data?.active;
  return (
    <FieldSessionActions.Provider value={{signOut: () => void signOut(), signingOut}}><main className={"field-app" + (screen !== "home" && scheduleView === "map" ? " field-app-map" : "")}>
      <FieldOffline onSynced={refresh} open={syncOpen} onClose={() => setSyncOpen(false)}/>
      <header className="field-header">
        <div>
          <small>PORTAL TÉCNICO RJ</small>
          <h1>
            {screen === "home"
              ? "Seu dia em campo"
              : "Minha programação"}
          </h1>
        </div>
        <div className="field-header-actions">
            {nativePortal() && <button aria-label="Permissões do aplicativo" title="Permissões do aplicativo" onClick={() => nativePortal()?.permissions()}><Settings size={18}/></button>}
            <button aria-label="Sincronismo" title="Sincronismo" aria-haspopup="dialog" onClick={() => setSyncOpen(true)}><FieldSyncIcon/></button>
            {screen !== "home" && <button aria-label="Voltar ao menu" title="Voltar ao menu" onClick={() => setScreen("home")}><ArrowLeft size={20}/></button>}
          </div>
      </header>
      <div className="field-user-summary">
        <p className="field-user">{data?.displayName || "Técnico"}</p>
        {screen !== "home" && <span className="field-order-count">{groups.size} {groups.size === 1 ? "OS enviada" : "OSs enviadas"}</span>}
      </div>
      {locationMessage && <p className="field-user" role="status">{locationMessage}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {active?.state === "paused" &&
        active.pause_reason?.minutes &&
        now - Date.parse(active.pause_alert_at || active.segment_at) >=
          active.pause_reason.minutes * 60000 && (
          <PauseReminder session={active} refresh={refresh} />
        )}
          {active && (
            <button
              type="button"
              onClick={()=>{setScreen('schedule');setScheduleView('list');setOpenOperation(active.operation_id);}}
              aria-label="Abrir operação com apontamento em andamento"
              className={
                "field-active " + (active.state === "paused" ? "paused" : "")
              }
            >
              <b>
                {active.kind === "travel"
                  ? "Deslocamento em andamento"
                  : active.state === "paused"
                    ? "Atividade em pausa"
                    : "Atividade em andamento"}
              </b>
              <span>
                {elapsed(
                  active.state === "paused"
                    ? Math.max(0,(now-Date.parse(active.segment_at))/1000)
                    : sessionTotals(active, now).active,
                )}
              </span>
              {active.state==="paused"&&<small><Pause size={15}/> {active.pause_reason?.name||"Pausa"} · Total de pausas: {elapsed(Number(active.pause_history_seconds||0)+sessionTotals(active,now).pause)}</small>}
              <small>Abrir operação <ChevronRight size={14} aria-hidden="true"/></small>
              <small>O registro continua mesmo ao fechar a página.</small>
            </button>
          )}
      {screen === "home" ? (
        <><nav className="field-home" aria-label="Serviços do portal">
          <button onClick={() => setScreen("schedule")}>
            <CalendarDays />
            <span>
              <b>Programação</b>
              <small>Sua agenda, operações e relatórios</small>
            </span>
            <ChevronDown />
          </button>
          <button disabled>
            <Wallet />
            <span>
              <b>Controle de Despesas</b>
              <small>Em breve</small>
            </span>
          </button>
          <button disabled>
            <Handshake />
            <span>
              <b>Indicação de Vendas</b>
              <small>Em breve</small>
            </span>
          </button>

        </nav>
        {nativePortal()?.version&&<footer className="field-app-version">Portal Técnico RJ · Versão {nativePortal()!.version}</footer>}
        </>
      ) : (
        <>
          <nav className="field-view-switch" aria-label="Visualização da programação">
            <button aria-pressed={scheduleView === "list"} onClick={() => setScheduleView("list")}><ClipboardList size={16}/>Lista</button>
            <button aria-pressed={scheduleView === "calendar"} onClick={() => setScheduleView("calendar")}><CalendarDays size={16}/>Calendário</button>
            <button aria-pressed={scheduleView === "map"} onClick={() => setScheduleView("map")}><MapPin size={16}/>Mapa</button>
          </nav>
          {scheduleView==="list"&&<label className="field-include-closed"><input type="checkbox" checked={includeClosed} onChange={e=>setIncludeClosed(e.target.checked)}/> Mostrar também operações encerradas</label>}
          <FieldMap visible={scheduleView === "map"}/>
          {scheduleView === "calendar" && <FieldCalendar rows={data?.calendarRows || data?.rows || []} selected={selectedDay} onSelect={setSelectedDay} now={now}/>}
          {scheduleView === "calendar" && data && groups.size > 0 && !(data.calendarRows || data.rows).some((row: any) => (row.date || "") === selectedDay) && <p className="field-day-empty">Nenhuma OS programada para esta data.</p>}
          {scheduleView === "map" ? null : !data ? (
            <p>Carregando programação…</p>
          ) : !groups.size ? (
            <section className="field-empty">
              <CalendarDays size={38} />
              <h2>Nenhuma OS programada</h2>
              <p>As operações enviadas para você aparecerão aqui.</p>
            </section>
          ) : (
            [...groups].map(([id, rows]) => {
              const first = (scheduleView === "calendar" ? rows.find(row => (row.date || "") === selectedDay) : null) || rows[0];
              const done = rows.every(row=>["awaiting_review","reviewed","completed"].includes(row.status));
              const overdue = rows.some((row) => fieldOperationOverdue(row.date, row.status, now));
              return (
                <details name={orderAccordionName} onToggle={(event) => {
                  if (event.target !== event.currentTarget || !event.currentTarget.open) return;
                  const order = event.currentTarget;
                  setOpenOperation(null);
                  requestAnimationFrame(() => {
                    if (order.open) order.scrollIntoView({ block: "start", behavior: "smooth" });
                  });
                }} hidden={scheduleView === "calendar" && !rows.some(row => (row.date || "") === selectedDay)} className={"field-order" + (done ? " field-order-completed" : overdue ? " field-order-overdue" : "")} key={id}>
                  <summary>
                    <div>
                      <strong>OS {first.number}</strong>
                      <small className={fieldOperationOverdue(first.date, first.status, now) ? "field-overdue-date" : undefined}>{when(first.date, first.time)}</small>
                      {done && <span className="field-completed-badge">Executada</span>}
                      {overdue && <span className="field-overdue-badge">Em atraso</span>}
                    </div>
                    <div className="field-order-customer">
                      <b>{first.customer || "Cliente não informado"}</b>
                      <small>
                        {[first.city, first.state]
                          .filter(Boolean)
                          .join(" / ") || "Cidade não informada"}
                      </small>
                      <span>
                        {first.equipment || "Equipamento não informado"}
                      </span>
                    </div>
                    <ChevronDown size={20} />
                  </summary>
                  <div className="field-operations">
                    <FieldPdfButton scheduleId={String(first.schedule_id)}/>
                    {rows.map((row) => (
                      <div key={row.id} hidden={scheduleView === "calendar" && (row.date || "") !== selectedDay}><FieldOperation
                        key={row.id}
                        row={row}
                        open={openOperation === row.id}
                        onToggle={() => setOpenOperation(openOperation === row.id ? null : row.id)}
                        active={active}
                        now={now}
                        refresh={refresh}
                      /></div>
                    ))}
                  </div>
                </details>
              );
            })
          )}
          {scheduleView !== "map" && <p className="field-location">
            <MapPin size={14} /> Os apontamentos registram horário e
            localização. Mantenha a localização ativada. Registros offline serão enviados quando houver conexão.
          </p>}
        </>
      )}
    </main></FieldSessionActions.Provider>
  );
}
function MenuLight({status}:{status:string}) {
 const label=({complete:'Concluído',partial:'Em andamento / parcial',required:'Campo obrigatório pendente',empty:'Não preenchido'} as Record<string,string>)[status];
 return <span className={'field-menu-light field-menu-light-'+status} title={label} aria-hidden="true"/>;
}
function FieldOperation({ row, active, now, refresh, open, onToggle }: any) {
  const section = useRef<HTMLElement>(null);
  const finishDialog = useRef<HTMLDialogElement>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  useEffect(() => {
    const dialog = finishDialog.current;
    if (!dialog) return;
    if (confirmFinish && open) dialog.showModal();
    else dialog.close();
    return () => dialog.close();
  }, [confirmFinish, open]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => section.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const lastLoadedAt=useRef(0),reportOpening=useRef(false);
  const [reportLoading,setReportLoading]=useState(false);
  const [data, setData] = useState<any>(null),
    [view, setView] = useState(""),
    [reportVisited,setReportVisited]=useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reading, setReading] = useState(""),
    [reason, setReason] = useState("");
  async function load() {
    try {
      setData(await api("/api/field?operation=" + row.id));
      lastLoadedAt.current=Date.now();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (open) {void load();void position().catch(()=>{});}
  }, [open]);
  useEffect(() => {
    // Refresh a locked report when the planner returns it, including an open dialog.
    // Editable drafts are kept locally until the technician saves them.
    if (open && data && row.version !== undefined && row.version !== data.operation.version &&
      (data.reportSubmission || ["awaiting_review", "reviewed", "completed"].includes(data.operation.status))) {
      void load();
    }
  }, [open, row.version]);

  useEffect(() => {
    if (!open || !data || !(data.reportSubmission || ["awaiting_review", "reviewed", "completed"].includes(data.operation.status))) return;
    const refreshLocked = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refreshLocked, 10000);
    window.addEventListener('focus', refreshLocked);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshLocked); };
  }, [open, data?.reportSubmission?.at, data?.operation.status]);

  async function act(body: any) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const location = await position();
      const result=await api("/api/field", {
        ...body,
        operationId: row.id,
        requestId: crypto.randomUUID(),
        location,
      });
      await Promise.all([body.action!=="report_return"?load():Promise.resolve(),refresh()]);
      setMessage(result.queued?"Salvo no dispositivo. Aguardando sincronização.":"Registro salvo.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const operation = data?.operation,
    session = active?.operation_id === row.id ? active : null,
    locked = ["awaiting_review", "reviewed", "completed"].includes(
      operation?.status || row.status,
    );
  const endingTravel = session?.kind === "travel";
  const initialOdometer = endingTravel ? Number(session.odometer_start) : 0;
  const invalidOdometer = reading !== "" && (!Number.isFinite(Number(reading)) || Number(reading) < initialOdometer);
  const distance = endingTravel && reading !== "" && !invalidOdometer ? Number(reading) - initialOdometer : null;
  const estimatedEnd = data ? data.estimated_end : row.estimated_end;
  const checklistRun=operation?.document.checklistRun;
  const reportFields=checklistRun?stagesOf(checklistRun.template).flatMap(stage=>groupsOf(stage).flatMap(group=>group.fields)):[];
  const reportAnswers=Object.assign({},...Object.values(checklistRun?.stages||{}).map((stage:any)=>stage.answers||{}));
  const partsStatus=!data?.checked?'empty':data?.materials?.complete?'complete':'partial';
  const reportStatus=data?.reportSubmission?'complete':reportFields.length?checklistProgress(reportFields,reportAnswers):'empty';
  const workStatus=session?.kind==='work'?'partial':data?.progress?.work?'complete':'empty';
  const reportActivityRunning = session?.kind === 'work' && session?.state === 'running';
  const ready = data?.infoRead && data?.checked && !locked && !busy;
  const finishPending: string[] = data?.finishPending ?? ["Atualize a operação para verificar as pendências."];
  const canFinish = ready && finishPending.length === 0 && operation?.document.responsible === data?.email;
  const limit = session?.state === "paused" && session.pause_reason?.minutes;
  const alert =
    limit &&
    now - Date.parse(session.pause_alert_at || session.segment_at) >=
      limit * 60000;
  const vehicle = data?.settings.document.vehicles.find(
    (v: any) => v.id === operation?.document.vehicleId,
  );
  async function show(which: string) {
    if (which === "send" && !canFinish) return;
    if (which === "logs" && !data?.infoRead) return;
    if(which==='report') {
      if(reportOpening.current)return;
      if(!data?.reportSubmission&&!reportActivityRunning)window.alert('Inicie ou retome a atividade para editar o relatório e anexar fotos.');
      setReportVisited(true);
      setView('report');
      setError('');setMessage('');
      // The operation detail already includes the report. Reuse a recent response.
      if(data && Date.now()-lastLoadedAt.current<15000 && Number(row.version||0)<=Number(data.operation.version||0))return;
      reportOpening.current=true;setReportLoading(true);
      try{await load();}finally{reportOpening.current=false;setReportLoading(false);}
      return;
    }
    if(which==="travel")setReading("");
    setView(which);
    setError("");
    setMessage("");
    if (which === "parts") await load();
  }
  return (
    <section ref={section} className="field-operation">
      <dialog ref={finishDialog} className="field-finish-dialog" aria-label="Conferência antes de finalizar" onCancel={() => setConfirmFinish(false)}>
        <h3>Antes de finalizar a operação</h3>
        <p>Há peças não utilizadas que ainda não foram devolvidas?</p>
        <p>Se houver, registre a devolução no módulo <strong>Peças</strong> antes de encerrar a operação. Isso libera o saldo para outras operações.</p>
        <div className="field-finish-actions">
          <button type="button" autoFocus onClick={() => { setConfirmFinish(false); void show("parts"); }}>Sim, ir para Peças</button>
          <button type="button" disabled={!canFinish} onClick={async () => {
            setConfirmFinish(false);
            if (await act({ action: "finish_full" })) setView("");
          }}>Não, finalizar operação</button>
          <button type="button" className="field-finish-cancel" onClick={() => setConfirmFinish(false)}>Cancelar</button>
        </div>
      </dialog>
      <button
        className={"field-operation-title field-operation-status-" + (fieldOperationOverdue(row.date, operation?.status || row.status, now) ? "overdue" : operation?.status || row.status)}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>
          <b>
            OP{operationNumber(row.position)} · {row.description || "Sem descrição"}
          </b>
          <small className="field-operation-equipment">{row.operation_equipment||operation?.document.equipment?.label||operation?.document.equipment?.name||row.equipment||'Equipamento não informado'}</small>
          <small className={fieldOperationOverdue(row.date, operation?.status || row.status, now) ? "field-overdue-date" : undefined}>
            {when(row.date, row.time)} ·{" "}
            {statusNames[operation?.status || row.status]}
            {fieldOperationOverdue(row.date, operation?.status || row.status, now) && " · Em atraso"}
          </small>
          <small className="field-planned-duration"><Clock3 size={14} aria-hidden="true" /> Duração programada: {plannedDuration(operation ? operation.document.duration : row.duration)}</small>
          <small>Calendário: {data?.calendar_name||row.calendar_name||"da operação"}</small>
          <small className="field-planned-duration"><Clock3 size={14} aria-hidden="true" /> Término estimado: {estimatedEnd ? new Date(estimatedEnd).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "Não informado"}</small>
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <FieldReportScreen open={open} busy={busy} heading={`OP${operationNumber(row.position)} · ${row.description||'Sem descrição'}`} title={`OS ${row.number} · ${row.customer||'Cliente não informado'}`} onClose={()=>{if(view){setView('');setError('');setMessage('');}else onToggle();}}>
        <p className="field-operation-screen-equipment">{row.operation_equipment||operation?.document.equipment?.label||operation?.document.equipment?.name||row.equipment||'Equipamento não informado'}</p>
        <div className="field-operation-body">
          {!data ? (
            <p>Carregando operação…</p>
          ) : (
            <>
              {reportVisited && data.checked && (
                <section className="field-inline-report" aria-label="Relatório técnico da operação" hidden={view!=='report'}>
                  {reportLoading&&<div className="field-report-loading" role="status" aria-label="Carregando relatório"><LoaderCircle size={48} aria-hidden="true"/></div>}
                  <ScheduleChecklistRun
                    compact
                    readOnly={!!data.reportSubmission||!reportActivityRunning||reportLoading}
                    operation={operation}
                    data={data}
                    busy={busy}
                    dirty={false}
                    mutate={act}
                    renderActions={(save:()=>Promise<any>,getDrafts:()=>any[])=><div className="field-report-footer">
                      {busy&&<p role="status">Obtendo localização e salvando…</p>}
                      {error&&<p className="field-error" role="alert">{error}</p>}
                      {message&&<p className="field-success" role="status">{message}</p>}
                      {data.reportSubmission?<><FieldPdfButton operationId={row.id}/><p className="field-success" role="status">Relatório enviado completo em {new Date(data.reportSubmission.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} por {data.reportSubmission.name||data.reportSubmission.by}.<br/>O planejador pode devolver o relatório para edição.</p></>:<>
                        {checklistRun?.partialSubmission&&<p className="field-success">Enviado parcial em {new Date(checklistRun.partialSubmission.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} por {checklistRun.partialSubmission.name||checklistRun.partialSubmission.by}. Você pode continuar editando.</p>}
                        <div className="field-report-actions">
                          <FieldPdfButton operationId={row.id}/>
                          <button disabled={!ready||!reportActivityRunning||reportLoading} onClick={()=>void save()}><SaveActionIcon/> Salvar</button>
                          <button type="button" disabled={busy||reportLoading||locked||!!checklistRun?.partialSubmission||operation.document.responsible!==data.email} onClick={async()=>{
                            const reason=window.prompt('Informe ao planejador por que o checklist precisa ser corrigido:');
                            if(!reason?.trim())return;
                            if(!window.confirm('Devolver ao planejamento? O preenchimento e as fotos serão preservados. Os dados só serão apagados se o planejador confirmar a substituição do checklist.'))return;
                            if(await act({action:'report_return',version:operation.version,reason,confirmReturn:true,stages:getDrafts()}))setView('');
                          }}><ArrowLeft size={18}/> Devolver</button>
                          <button disabled={!ready||reportLoading||!reportActivityRunning||operation.document.responsible!==data.email} onClick={async()=>{if(await act({action:'report_send',version:operation.version,stages:getDrafts()}))setView('');}}><Flag size={18}/> Enviar</button>
                        </div>
                      </>}
                    </div>}
                  />

                </section>
              )}
              {view === "logs" && <FieldTimeLogs operationId={row.id} />}
              {!view && <>
              {!data.infoRead && !locked && <p className="field-step"><b>1. Leia as informações</b><br/>Abra Informações e confirme a leitura das observações internas para continuar.</p>}
              {data.infoRead && !data.checked && !locked && (
                <p className="field-step">
                  <b>2. Confira as peças</b>
                  <br />
                  Confirme os materiais, mesmo se não houver retirada. Depois os
                  demais botões serão liberados.
                </p>
              )}
              <div className="field-actions">
                <button onClick={() => void show("info")}>
                  <Info />
                  <MenuLight status={data.infoRead?"complete":"empty"}/><span>Informações</span>
                </button>
                <button
                  disabled={busy || (!locked && !data.infoRead)}
                  onClick={() => void show("parts")}
                >
                  <Package />
                  <MenuLight status={partsStatus}/><span>Peças</span>
                </button>
                <button
                  className={session?.kind === "travel" ? "is-active" : ""}
                  disabled={
                    !ready ||
                    (!!active && active.id !== session?.id) ||
                    session?.kind === "work"
                  }
                  onClick={() => {
                    setReading("");
                    void show("travel");
                  }}
                >
                  <span className="field-icon-pair">
                    <MenuLight status={session?.kind==="travel"?"partial":data.progress?.travel?"complete":"empty"}/>
                    <Car />
                    {session?.kind === "travel" ? (
                      <Square size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                  </span>
                  <span>
                    {session?.kind === "travel"
                      ? "Encerrar deslocamento"
                      : "Iniciar deslocamento"}
                  </span>
                </button>
                {!session || session.kind !== "work" ? (
                  <button
                    disabled={!ready || !!active}
                    onClick={() => void act({ action: "start_work" })}
                  >
                    <span className="field-icon-pair">
                      <Wrench />
                      <Play size={15} />
                    </span>
                    <MenuLight status={workStatus}/><span>Iniciar atividade</span>
                  </button>
                ) : (
                  <>
                    <button
                      className={
                        session.state === "paused" ? "is-paused" : "is-active"
                      }
                      disabled={!ready}
                      onClick={() =>
                        session.state === "paused"
                          ? void act({
                              action: "resume",
                              sessionId: session.id,
                            })
                          : void show("pause")
                      }
                    >
                      <span className="field-icon-pair">
                        <Wrench />
                        {session.state === "paused" ? (
                          <Play size={15} />
                        ) : (
                          <Pause size={15} />
                        )}
                      </span>
                      <MenuLight status={workStatus}/><span>
                        {session.state === "paused"
                          ? "Retomar atividade"
                          : "Pausar atividade"}
                      </span>
                    </button>
                    <button
                      disabled={!ready}
                      onClick={() =>
                        void act({ action: "stop", sessionId: session.id })
                      }
                    >
                      <span className="field-icon-pair">
                        <Wrench />
                        <Square size={15} />
                      </span>
                      <MenuLight status={workStatus}/><span>Finalizar apontamento</span>
                    </button>
                  </>
                )}
                <button disabled={busy || !data.infoRead} onClick={() => void show("logs")}>
                  <Clock3 />
                  <span>Apontamentos</span>
                </button>
                <button
                  disabled={busy || !data.infoRead || !data.checked || !operation.document.checklistId}
                  onClick={() => void show("report")}
                >
                  <ClipboardList />
                  <MenuLight status={reportStatus}/><span>Relatório</span>
                </button>
                <button
                  disabled={!canFinish}
                  onClick={() => void show("send")}
                >
                  <Flag />
                  <MenuLight status={locked?"complete":finishPending.length?"required":"empty"}/><span>Finalizar Operação</span>
                </button>

              </div>
              {!operation.document.checklistId && (
                <small>Esta operação não possui checklist.</small>
              )}
              {session && (
                <p
                  className={
                    "field-timer " +
                    (session.state === "paused" ? "paused" : "")
                  }
                >
                  {session.kind === "travel"
                    ? "Deslocamento"
                    : session.state === "paused"
                      ? "Pausa: " + session.pause_reason?.name
                      : "Atividade"}{" "}
                  ·{" "}
                  <b>
                    {elapsed(
                      session.state === "paused"
                        ? Math.max(0,(now-Date.parse(session.segment_at))/1000)
                        : sessionTotals(session, now).active,
                    )}
                  </b>
                  {session.state==="paused"&&<span className="field-pause-total">Total de pausas: {elapsed(Number(data.pause_history_seconds||0)+sessionTotals(session,now).pause)}</span>}
                  {session.kind === "travel" && (
                    <small>Odômetro inicial: {session.odometer_start} km</small>
                  )}
                </p>
              )}
              </>}
              {view === "info" && (
                <section className="field-panel">
                  <h3>Observações internas</h3>
                  <p className="field-note">
                    {operation.document.internalNote ||
                      "Nenhuma observação interna."}
                  </p>
                  <div className="field-vehicle-info"><Car size={18}/><div><small>Veículo programado</small><strong>{vehicle?.name || "Não atribuído"}</strong></div></div>
                  {data.infoRead ? <p className="field-checked"><CheckCircle2 size={16}/> Leitura confirmada</p> : <button disabled={busy||locked} onClick={async()=>{if(await act({action:'info_read'}))setView('');}}>Li e compreendi as informações</button>}
                </section>
              )}
              {view === "parts" && <Parts data={data} readOnly={locked||!!data.reportSubmission} busy={busy} save={async (body: any) => {
                if (await act(body)) setView("");
              }} />}
              {view === "send" && (
                <section className="field-panel">
                  <h3>Finalizar operação</h3>
                  {finishPending.length > 0 ? <div className="field-finish-pending" role="status">
                    <p>Para encerrar esta operação, conclua as pendências:</p>
                    <ul>{finishPending.map(pending => <li key={pending}>{pending}</li>)}</ul>
                  </div> : <p>Etapas obrigatórias concluídas. Você já pode finalizar a operação.</p>}
                  <button
                    disabled={!canFinish}
                    onClick={() => setConfirmFinish(true)}
                  >
                    Finalizar operação · enviar para revisão
                  </button>
                </section>
              )}
              {view === "travel" && (
                <section className="field-panel">
                  <h3>
                    {session?.kind === "travel" ? "Encerrar" : "Iniciar"}{" "}
                    deslocamento
                  </h3>
                  <p>
                    {vehicle?.name ||
                      "Veículo não atribuído. Solicite ao planejamento."}
                  </p>
                  {endingTravel && <p>Odômetro inicial: <strong>{initialOdometer.toLocaleString("pt-BR", {maximumFractionDigits: 3})} km</strong></p>}
                  <label>
                    Odômetro {session?.kind === "travel" ? "final" : "inicial"}{" "}
                    (km)
                    <input
                      type="number"
                      min={initialOdometer}
                      step="0.1"
                      inputMode="decimal"
                      value={reading}
                      onChange={(e) => setReading(e.target.value)}
                    />
                  </label>
                  {endingTravel && <p className="field-travel-distance" role="status" aria-live="polite">
                    Quilômetros percorridos: <strong>{distance === null ? "—" : distance.toLocaleString("pt-BR", {maximumFractionDigits: 3}) + " km"}</strong>
                  </p>}
                  {invalidOdometer && <p className="field-error" role="alert">{endingTravel ? "O odômetro final não pode ser menor que o inicial." : "Informe um odômetro válido."}</p>}
                  <button
                    disabled={!ready || !reading || !vehicle || invalidOdometer}
                    onClick={async () => {
                      if (
                        await act({
                          action:
                            session?.kind === "travel"
                              ? "stop"
                              : "start_travel",
                          sessionId: session?.id,
                          odometer: Number(reading),
                        })
                      )
                        setView("");
                    }}
                  >
                    Confirmar {session?.kind === "travel" ? "chegada" : "saída"}
                  </button>
                </section>
              )}
              {view === "pause" && session?.state === "running" && (
                <section className="field-panel">
                  <h3>Por que você vai pausar?</h3>
                  <label>
                    Causa da pausa
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {data.settings.document.pauseReasons.map((r: any) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!data.settings.document.pauseReasons.length && (
                    <p>Solicite o cadastro das causas ao planejamento.</p>
                  )}
                  <button
                    disabled={!ready || !reason}
                    onClick={async () => {
                      if (
                        await act({
                          action: "pause",
                          sessionId: session.id,
                          reasonId: reason,
                        })
                      )
                        setView("");
                    }}
                  >
                    Confirmar pausa
                  </button>
                </section>
              )}
              {!view && data.history.length > 0 && (
                <details className="field-history">
                  <summary>Últimos registros</summary>
                  {data.history.map((h: any, i: number) => (
                    <p key={i}>
                      <b>{h.display_name || "Técnico"}</b> ·{" "}
                      {new Date(h.created_at).toLocaleString("pt-BR")}
                      <br />
                      {{
                        info_read: "Leitura das observações confirmada",
                        materials: "Conferência de peças",
                        start_work: "Início da atividade",
                        start_travel: "Início do deslocamento",
                        pause: "Pausa",
                        resume: "Retomada",
                        stop: "Apontamento finalizado",
                        pause_ack: "Pausa confirmada",
                        report_save: "Relatório salvo como rascunho",
                        report_send: "Relatório enviado completo",
                        report_send_partial: "Relatório enviado parcial",
                        finish_full: "Operação finalizada",
                        finish_partial: "Relatório parcial",
                        checklist_save: "Rascunho do checklist",
                        checklist_submit: "Etapa do checklist devolvida",
                      }[h.action as string] || h.action}
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
          {busy && <p role="status">Obtendo localização e salvando…</p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {message && view !== "report" && (
            <p className="field-success" role="status">
              {message}
            </p>
          )}
        </div>
        </FieldReportScreen>
      )}
    </section>
  );
}
function Parts({ data, busy, save, readOnly=false }: any) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState(false);
  const items = data.materials.items;
  const key = (i: any) => `${i.item_company}:${i.item_order}:${i.id_m8}`;
  useEffect(() => {
    setValues(
      Object.fromEntries(
        items.map((i: any) => [key(i), String(materialBalance(i, data.operation.id).own)]),
      ),
    );
    setConfirmed(false);
  }, [JSON.stringify(items)]);
  return (
    <section className="field-panel">
      <h3>Conferência de peças da OS</h3>
      <p>
        {readOnly ? "Peças desta operação · somente visualização." : "Informe a retirada desta operação. Devoluções liberam saldo para outras operações."}
      </p>
      {!data.materials.complete && (
        <p className="field-error">
          Os materiais ainda estão sendo importados. A conferência será liberada
          quando a coleta terminar.
        </p>
      )}
      {!items.length && <p>Nenhuma peça cadastrada nesta OS.</p>}
      {items.map((i: any) => {
        const balance = materialBalance(i, data.operation.id);
        const blocked = balance.available === 0 && balance.own === 0;
        const canReturn = balance.own > 0 && balance.total - balance.own >= Number(i.usage?.used || 0);
        return (
        <div
          className={"field-part " + (i.source_linked ? "linked" : "")}
          key={key(i)}
        >
          <div className="field-part-info">
          <b>
            {i.produto_id} · {i.produto_nome}
          </b>
          <small className="field-part-unit">Unidade: {i.unidade_nome}</small>
          {i.quantity_inconsistency && <small className="field-error">Quantidade divergente na OS vinculada.</small>}
          <dl className="field-part-balances">
            <div><dt>Reservado</dt><dd>{balance.reserved.toLocaleString("pt-BR")}</dd></div>
            <div><dt>Retirado</dt><dd>{balance.total.toLocaleString("pt-BR")}</dd></div>
            <div className="field-part-available"><dt>Disponível</dt><dd>{balance.available.toLocaleString("pt-BR")}</dd></div>
          </dl>
          {blocked && <p className="field-material-held" role="status">
            Quantidade reservada totalmente retirada. Uma devolução na operação de origem libera saldo para nova retirada.
          </p>}
          </div>
          <div className="field-part-quantity">
          <label>
            Retirado nesta operação
            <input
              disabled={readOnly || busy || Boolean(blocked)}
              type="number"
              min="0"
              max={balance.maximum}
              step="0.001"
              inputMode="decimal"
              value={values[key(i)] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [key(i)]: e.target.value })
              }
            />
          </label>
          {canReturn && !readOnly && <button className="field-part-return" type="button" disabled={busy || values[key(i)] === "0"} onClick={() => {
            setValues({ ...values, [key(i)]: "0" });
            setConfirmed(false);
          }}>Devolver peça</button>}
          </div>
          {balance.withdrawals.some(row => row.quantity > 0) && <details className="field-part-history" open={blocked || undefined}>
            <summary>Ver retiradas ({balance.withdrawals.filter(row => row.quantity > 0).length})</summary>
            {balance.withdrawals.filter(row => row.quantity > 0).map((row, index) => <div className="field-part-withdrawal" key={row.operationId || index}>
              <strong>{row.position ? `Operação ${operationNumber(row.position)}` : "Planejamento"} · {row.quantity.toLocaleString("pt-BR")} {i.unidade_nome}</strong>
              <span>{row.name || row.by}</span>
              {row.at && <time dateTime={row.at}>{new Date(row.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</time>}
            </div>)}
          </details>}
          {Number(values[key(i)] || 0) > balance.maximum && <small className="field-error">Quantidade acima do saldo. Esta operação pode retirar até {balance.maximum.toLocaleString("pt-BR")}.</small>}
          {canReturn && values[key(i)] === "0" && <small>Devolução pendente. Confirme a conferência para liberar esta peça.</small>}
        </div>
      );})}
      <label className="field-confirm" hidden={readOnly}>
        <input
          type="checkbox"
          disabled={readOnly}
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>Conferi as peças e confirmo as quantidades, inclusive quando não houve
        retirada.</span>
      </label>
      <button hidden={readOnly}
        disabled={readOnly || busy || !confirmed || !data.materials.complete || items.some((item: any) => {
          const value = Number(values[key(item)] || 0);
          return !Number.isFinite(value) || value < 0 || value > materialBalance(item, data.operation.id).maximum;
        })}
        onClick={() =>
          void save({
            action: "materials",
            quantityScope: "operation",
            items: items.map((i: any) => ({
              id_m8: i.id_m8,
              item_company: i.item_company,
              item_order: i.item_order,
              version: i.usage?.version ?? null,
              withdrawn: values[key(i)] === "" ? null : Number(values[key(i)]),
            })),
          })
        }
      >
        <CheckCircle2 size={18} /> Confirmar conferência
      </button>
    </section>
  );
}

function PauseReminder({ session, refresh }: any) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function respond(action: string) {
    setBusy(true);
    setError("");
    try {
      await api("/api/field", {
        action,
        operationId: session.operation_id,
        sessionId: session.id,
        requestId: crypto.randomUUID(),
        location: await position(),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="field-pause-alert" role="alert">
      <b>Você ainda está em pausa?</b>
      <p>
        {session.pause_reason.name}: o limite de {session.pause_reason.minutes}{" "}
        minutos foi atingido.
      </p>
      <button disabled={busy} onClick={() => void respond("pause_ack")}>
        Sim, continuar em pausa
      </button>
      <button disabled={busy} onClick={() => void respond("resume")}>
        Retomar atividade
      </button>
      {error && <p>{error}</p>}
    </section>
  );
}
