"use client";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
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
  CheckCircle2,
  RefreshCw,
  MapPin,
} from "lucide-react";
import {stagesOf,groupsOf} from '@/lib/service-scheduling/checklists';
import {checklistProgress} from '@/lib/service-scheduling/checklist-progress';
import SaveActionIcon from "./save-action-icon";
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
async function position() {
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
      () =>
        reject(
          Error(
            "Permita a localização do aparelho e tente novamente. O registro ainda não foi salvo.",
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
const elapsed = (seconds: number) => {
  const n = Math.floor(seconds);
  return `${String(Math.floor(n / 3600)).padStart(2, "0")}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
export default function FieldApp() {
  const [screen, setScreen] = useState("home"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [now, setNow] = useState(Date.now());
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
  for (const row of data?.rows || []) {
    const k = String(row.schedule_id);
    groups.set(k, [...(groups.get(k) || []), row]);
  }
  const active = data?.active;
  return (
    <main className="field-app">
      <header className="field-header">
        <div>
          <small>RJ COMPRESSORES · TÉCNICO</small>
          <h1>
            {screen === "home"
              ? "Olá! O que vamos fazer?"
              : "Minha programação"}
          </h1>
        </div>
        {screen !== "home" && (
          <button aria-label="Voltar ao menu" onClick={() => setScreen("home")}>
            <ArrowLeft />
          </button>
        )}
      </header>
      <p className="field-user">{data?.displayName || "Técnico"}</p>
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
      {screen === "home" ? (
        <nav className="field-home">
          <button onClick={() => setScreen("schedule")}>
            <CalendarDays />
            <span>
              <b>Programação</b>
              <small>OSs, peças e apontamentos</small>
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
          <a href="/modulos/assistencia-tecnica">Acessar sistema de gestão</a>
        </nav>
      ) : (
        <>
          <div className="field-toolbar">
            <span>
              {groups.size} {groups.size === 1 ? "OS enviada" : "OSs enviadas"}
            </span>
            <button
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                await refresh();
                setLoading(false);
              }}
            >
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
          {active && (
            <div
              className={
                "field-active " + (active.state === "paused" ? "paused" : "")
              }
              role="status"
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
                    ? sessionTotals(active, now).pause
                    : sessionTotals(active, now).active,
                )}
              </span>
              <small>O registro continua mesmo ao fechar a página.</small>
            </div>
          )}
          {!data ? (
            <p>Carregando programação…</p>
          ) : !groups.size ? (
            <section className="field-empty">
              <CalendarDays size={38} />
              <h2>Nenhuma OS programada</h2>
              <p>As operações enviadas para você aparecerão aqui.</p>
            </section>
          ) : (
            [...groups].map(([id, rows]) => {
              const first = rows[0];
              return (
                <details className="field-order" key={id}>
                  <summary>
                    <div>
                      <strong>OS {first.number}</strong>
                      <small>{when(first.date, first.time)}</small>
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
                    {rows.map((row) => (
                      <FieldOperation
                        key={row.id}
                        row={row}
                        active={active}
                        now={now}
                        refresh={refresh}
                      />
                    ))}
                  </div>
                </details>
              );
            })
          )}
          <p className="field-location">
            <MapPin size={14} /> Os apontamentos registram horário e
            localização. Mantenha a internet e a localização ativadas.
          </p>
        </>
      )}
    </main>
  );
}
function MenuLight({status}:{status:string}) {
 const label=({complete:'Concluído',partial:'Em andamento / parcial',required:'Campo obrigatório pendente',empty:'Não preenchido'} as Record<string,string>)[status];
 return <span className={'field-menu-light field-menu-light-'+status} title={label} aria-hidden="true"/>;
}
function FieldOperation({ row, active, now, refresh }: any) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<any>(null),
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
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (open) void load();
  }, [open]);
  async function act(body: any) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const location = await position();
      await api("/api/field", {
        ...body,
        operationId: row.id,
        requestId: crypto.randomUUID(),
        location,
      });
      await load();
      await refresh();
      setMessage("Registro salvo.");
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
  const checklistRun=operation?.document.checklistRun;
  const reportFields=checklistRun?stagesOf(checklistRun.template).flatMap(stage=>groupsOf(stage).flatMap(group=>group.fields)):[];
  const reportAnswers=Object.assign({},...Object.values(checklistRun?.stages||{}).map((stage:any)=>stage.answers||{}));
  const partsStatus=!data?.checked?'empty':data?.materials?.complete && data.materials.items.every((item:any)=>Number(item.usage?.withdrawn??0)>=Number(item.quantidade??0))?'complete':'partial';
  const reportStatus=reportFields.length?checklistProgress(reportFields,reportAnswers):'empty';
  const workStatus=session?.kind==='work'?'partial':data?.progress?.work?'complete':'empty';
  const ready = data?.infoRead && data?.checked && !locked && !busy;
  const limit = session?.state === "paused" && session.pause_reason?.minutes;
  const alert =
    limit &&
    now - Date.parse(session.pause_alert_at || session.segment_at) >=
      limit * 60000;
  const vehicle = data?.settings.document.vehicles.find(
    (v: any) => v.id === operation?.document.vehicleId,
  );
  async function show(which: string) {
    if(which==='report')setReportVisited(true);
    setView(which);
    setError("");
    setMessage("");
    if (which === "parts") await load();
  }
  return (
    <section className="field-operation">
      <button
        className="field-operation-title"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>
          <b>
            Operação {row.position} · {row.description || "Sem descrição"}
          </b>
          <small>
            {when(row.date, row.time)} ·{" "}
            {statusNames[operation?.status || row.status]}
          </small>
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="field-operation-body">
          {!data ? (
            <p>Carregando operação…</p>
          ) : (
            <>
              {view && view!=="report" && (
                <button type="button" disabled={busy} onClick={() => { setView(""); setError(""); setMessage(""); }}>
                  <ArrowLeft size={18} /> Voltar ao menu
                </button>
              )}
              {reportVisited && data.checked && !locked && (
                <FieldReportScreen open={view==='report'} busy={busy} title={`OS ${row.number} · Operação ${row.position}`} onClose={()=>setView('')}>
                  <ScheduleChecklistRun
                    compact
                    operation={operation}
                    data={data}
                    busy={busy}
                    dirty={false}
                    mutate={act}
                    renderActions={(save:()=>Promise<any>)=><div className="field-report-footer">
                      {busy&&<p role="status">Obtendo localização e salvando…</p>}
                      {error&&<p className="field-error" role="alert">{error}</p>}
                      {message&&<p className="field-success" role="status">{message}</p>}
                      <div className="field-report-actions"><button disabled={!ready} onClick={()=>void save()}><SaveActionIcon/> Salvar Relatório</button><button disabled={!ready||operation.document.responsible!==data.email} onClick={()=>void act({action:'report_send',version:operation.version})}><Flag size={18}/> Enviar relatório</button></div>
                    </div>}
                  />

                </FieldReportScreen>
              )}
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
                  disabled={busy || locked || !data.infoRead}
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
                <button
                  disabled={!ready || !operation.document.checklistId}
                  onClick={() => void show("report")}
                >
                  <ClipboardList />
                  <MenuLight status={reportStatus}/><span>Relatório</span>
                </button>
                <button
                  disabled={
                    !ready || operation.document.responsible !== data.email
                  }
                  onClick={() => void show("send")}
                >
                  <Flag />
                  <MenuLight status={locked?"complete":data.progress?.partial?"partial":"empty"}/><span>Finalizar Operação</span>
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
                        ? sessionTotals(session, now).pause
                        : sessionTotals(session, now).active,
                    )}
                  </b>
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
                  <small>Veículo: {vehicle?.name || "Não atribuído"}</small>
                  {data.infoRead ? <p className="field-checked"><CheckCircle2 size={16}/> Leitura confirmada</p> : <button disabled={busy||locked} onClick={async()=>{if(await act({action:'info_read'}))setView('');}}>Li e compreendi as informações</button>}
                </section>
              )}
              {view === "parts" && <Parts data={data} busy={busy} save={act} />}
              {view === "send" && (
                <section className="field-panel">
                  <h3>Finalizar operação</h3>
                  <p>Finalize os apontamentos da equipe antes de finalizar a operação.</p>
                  <button
                    disabled={!ready}
                    onClick={async () => {
                      if (await act({ action: "finish_partial" })) setView("");
                    }}
                  >
                    Finalização parcial · continuar depois
                  </button>
                  <button
                    disabled={!ready}
                    onClick={async () => {
                      if (await act({ action: "finish_full" })) setView("");
                    }}
                  >
                    Finalização completa · enviar para revisão
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
                  <label>
                    Odômetro {session?.kind === "travel" ? "final" : "inicial"}{" "}
                    (km)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={reading}
                      onChange={(e) => setReading(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={!ready || !reading || !vehicle}
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
                        report_send: "Relatório enviado",
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
          {message && (
            <p className="field-success" role="status">
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
function Parts({ data, busy, save }: any) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState(false);
  const items = data.materials.items;
  const key = (i: any) => `${i.item_company}:${i.item_order}:${i.id_m8}`;
  useEffect(() => {
    setValues(
      Object.fromEntries(
        items.map((i: any) => [key(i), i.usage?.withdrawn ?? ""]),
      ),
    );
    setConfirmed(false);
  }, [JSON.stringify(items)]);
  return (
    <section className="field-panel">
      <h3>Conferência de peças da OS</h3>
      <p>
        Informe o total já retirado de cada peça. Valores de outras operações
        são compartilhados; não some a mesma retirada duas vezes.
      </p>
      {!data.materials.complete && (
        <p className="field-error">
          Os materiais ainda estão sendo importados. A conferência será liberada
          quando a coleta terminar.
        </p>
      )}
      {!items.length && <p>Nenhuma peça cadastrada nesta OS.</p>}
      {items.map((i: any) => (
        <div
          className={"field-part " + (i.source_linked ? "linked" : "")}
          key={key(i)}
        >
          <div className="field-part-info">
          <b>
            {i.produto_id} · {i.produto_nome}
          </b>
          <small>
            Quantidade na OS: {i.quantidade} {i.unidade_nome}
          </small>
          {i.quantity_inconsistency && (
            <small className="field-error">
              Quantidade divergente na OS vinculada.
            </small>
          )}
          {i.usage && (
            <small>
              Última atualização:{" "}
              {i.usage.position
                ? "operação " + i.usage.position
                : "planejamento"}{" "}
              · {i.usage.display_name || i.usage.updated_by}
              {i.usage.updated_at && (
                <> · {new Date(i.usage.updated_at).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}</>
              )}
            </small>
          )}
          </div>
          <label>
            Total retirado
            <input
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={values[key(i)] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [key(i)]: e.target.value })
              }
            />
          </label>
        </div>
      ))}
      <label className="field-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>Conferi as peças e confirmo as quantidades, inclusive quando não houve
        retirada.</span>
      </label>
      <button
        disabled={busy || !confirmed || !data.materials.complete}
        onClick={() =>
          void save({
            action: "materials",
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
