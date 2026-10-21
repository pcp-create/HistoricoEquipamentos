"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  List,
  CalendarDays,
  MapPin,
  Plus,
  Pencil,
  RefreshCw,
  LogOut,
  CheckCircle2,
  Clock3,
  Users,
  UserPlus,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Wallet,
  Search,
  X,
  History,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  brazilDay,
  healthLabels,
  type VisitCustomer,
  type SalesVisit,
  type VisitsData,
} from "@/lib/visits/model";
import SalesCustomerLocation from "./sales-customer-location";
import SalesCustomerSelect from "./sales-customer-select";
import SalesVisitsMap from "./sales-visits-map";
import { readActivityLocation } from "@/lib/activity-location";
import "./field-app.css";
import "./sales-visits.css";
const localNow = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date())
    .replace(" ", "T");
const display = (v: string) =>
  new Date(v).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
type Form = {
  mode: "schedule" | "history" | "complete";
  id: string;
  version?: number;
  purpose_id: string;
  customer_key: string;
  lead: boolean;
  leadId: string;
  leadName: string;
  leadPoint?: [number,number];
  city: string;
  uf: string;
  address: string;
  scheduled_at: string;
  contact: string;
  phone: string;
  description: string;
  outcome: string;
};
export default function SalesVisits({scheduleOnly=false,onClose,onScheduled}:{scheduleOnly?:boolean;onClose?:()=>void;onScheduled?:()=>void|Promise<void>} = {}) {
  const [home, setHome] = useState(true);
  const [data, setData] = useState<VisitsData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true);
  const [tab, setTab] = useState("summary"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [listMode, setListMode] = useState("customers"),
    [month, setMonth] = useState(() => brazilDay(new Date()).slice(0, 7)),
    [selectedDay, setSelectedDay] = useState(""),
    [form, setForm] = useState<Form | null>(null);
  const [allCustomers,setAllCustomers] = useState<VisitCustomer[]>([]);
  const [outsidePortfolio,setOutsidePortfolio] = useState(false);
  const [customerLoading,setCustomerLoading] = useState(false);
  async function loadAllCustomers(){setCustomerLoading(true);try{const r=await fetch('/api/visits/customers',{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setAllCustomers(b.customers)}catch(e){setError((e as Error).message)}finally{setCustomerLoading(false)}}
  const leadAddressRequest=useRef<AbortController | null>(null);
  const [editingLeadAddress,setEditingLeadAddress]=useState(false);
  const [leadAddressStatus,setLeadAddressStatus]=useState("");
  useEffect(()=>()=>leadAddressRequest.current?.abort(),[]);
  async function selectLeadPoint(leadPoint:[number,number]){
    if(!form)return;
    const original=form;
    leadAddressRequest.current?.abort();
    const controller=new AbortController();leadAddressRequest.current=controller;
    setForm(current=>current?{...current,leadPoint}:current);
    setEditingLeadAddress(false);
    setLeadAddressStatus("Preenchendo endereço da localização…");
    try{
      const r=await fetch('/api/visits/location-search',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'reverse',latitude:leadPoint[0],longitude:leadPoint[1]})});
      const b=await r.json();if(!r.ok)throw Error();if(controller.signal.aborted)return;
      if(!b.address || (!b.address.city && !b.address.uf && !b.address.address)){setLeadAddressStatus("Endereço não encontrado. Preencha os campos manualmente.");return;}
      setForm(current=>{
        if(!current?.lead || current.leadId!==original.leadId || current.leadPoint?.[0]!==leadPoint[0] || current.leadPoint?.[1]!==leadPoint[1])return current;
        return {...current,...Object.fromEntries((["city","uf","address"] as const).filter(key=>b.address[key] && current[key]===original[key]).map(key=>[key,b.address[key]]))};
      });
      setLeadAddressStatus("Localização identificada. Confira os dados abaixo.");
    }catch{if(!controller.signal.aborted)setLeadAddressStatus("Não foi possível consultar o endereço. A posição foi mantida; preencha os campos manualmente.");}
  }
  const [detail, setDetail] = useState<VisitCustomer | null>(null);
  const [meterForm, setMeterForm] = useState<{customer: VisitCustomer; equipment: NonNullable<VisitCustomer["equipment"]>[number]} | null>(null);
  const [meterValue, setMeterValue] = useState("");
  const [meterDate, setMeterDate] = useState("");
  const [meterError, setMeterError] = useState("");
  const [meterBusy, setMeterBusy] = useState(false);
  const selectEquipment = useCallback((customer: VisitCustomer, equipment: NonNullable<VisitCustomer["equipment"]>[number]) => {
    setMeterForm({customer,equipment}); setMeterDate(brazilDay(new Date())); setMeterValue(""); setMeterError("");
  }, []);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/visits", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setData(b);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [reload]);
  useEffect(() => {
    if(scheduleOnly) return;
    let stopped = false, busy = false;
    async function pulse() {
      if (busy || !navigator.onLine || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const location = await readActivityLocation(navigator.geolocation);
        if (stopped || document.visibilityState !== "visible") return;
        const response = await fetch("/api/activity", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location }),
        });
        if (response.ok && !stopped) await reload();
      } catch { /* Keep visits accessible if positioning is unavailable. */ }
      finally { busy = false; }
    }
    void pulse();
    const timer = setInterval(pulse, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", pulse);
    window.addEventListener("online", pulse);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", pulse); window.removeEventListener("online", pulse); };
  }, [reload,scheduleOnly]);
  const customers = data?.customers || [],
    visits = data?.visits || [];
  const matches = (c: VisitCustomer) =>
    fold(`${c.name} ${c.document} ${c.city} ${c.uf}`).includes(fold(query));
  const filtered = useMemo(() => customers.filter(
    (c) => fold(`${c.name} ${c.document} ${c.city} ${c.uf}`).includes(fold(query)) && (filter === "all" || (filter === "leads" ? c.lead : c.health === filter)),
  ), [customers, query, filter]);
  const customerMap = new Map(customers.map((c) => [c.key, c]));
  const visitRows = visits.filter((v) => {
    const c = customerMap.get(v.customer_key);
    return c && matches(c) && (filter === "all" || (filter === "leads" ? c.lead : c.health === filter));
  });
  const completed = visits.filter((v) => v.status === "completed"),
    planned = visits.filter((v) => v.status === "scheduled");
  const portfolio = customers.filter(c=>c.in_portfolio !== false);
  const counts = {
    current: portfolio.filter((c) => c.health === "current").length,
    due: portfolio.filter((c) => c.health === "due").length,
    overdue: portfolio.filter((c) => c.health === "overdue").length,
  };
  const today = brazilDay(new Date()),
    doneMonth = completed.filter(
      (v) =>
        v.completed_at &&
        brazilDay(v.completed_at).startsWith(today.slice(0, 7)),
    ).length;
  const monthSeries = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = today.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 6 + i, 1));
    const key = day.toISOString().slice(0, 7);
    return {
      key,
      label: day.toLocaleDateString("pt-BR", {
        month: "short",
        timeZone: "UTC",
      }),
      count: completed.filter(
        (v) => v.completed_at && brazilDay(v.completed_at).startsWith(key),
      ).length,
    };
  });
  const maxMonthly = Math.max(1, ...monthSeries.map((m) => m.count));
  const openForm = useCallback(
    (mode: Form["mode"], c?: VisitCustomer, v?: SalesVisit) => {
      setError("");
      setMessage("");
      setEditingLeadAddress(false);setLeadAddressStatus("");leadAddressRequest.current?.abort();
      setOutsidePortfolio(false);
      setForm({
        purpose_id: v?.purpose_id || "",
        mode,
        id: v?.id || crypto.randomUUID(),
        version: v?.version,
        customer_key: c?.key || "",
        lead: false,
        leadId: crypto.randomUUID(),
        leadName: "",
        city: "",
        uf: "SC",
        address: "",
        scheduled_at:
          mode === "complete" || mode === "history"
            ? localNow()
            : selectedDay
              ? selectedDay + "T09:00"
              : "",
        contact: v?.contact || "",
        phone: v?.phone || "",
        description: v?.description || "",
        outcome: "",
      });
    },
    [selectedDay],
  );
  useEffect(()=>{if(scheduleOnly)openForm("schedule")},[scheduleOnly,openForm]);
  const formCustomer = customers.find(c=>c.key===form?.customer_key) || allCustomers.find(c=>c.key===form?.customer_key);
  const selectMap = useCallback((c: VisitCustomer) => setDetail(c), []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    if(form.lead && !form.city.trim()){setEditingLeadAddress(true);setError("Informe a cidade do Lead ou selecione uma localização no mapa.");return;}
    if (!form.lead && !form.customer_key) { setError("Selecione o cliente."); return; }
    setBusy(true);
    setError("");
    try {
      const date = new Date(form.scheduled_at + ":00-03:00").toISOString();
      const body = {
        action: form.mode === "complete" ? "complete" : form.mode,
        id: form.id,
        version: form.version,
        purpose_id: form.purpose_id,
        customer_key: form.customer_key,
        scheduled_at: date,
        completed_at: date,
        contact: form.contact,
        phone: form.phone,
        description: form.description,
        outcome: form.outcome,
        ...(form.lead
          ? {
              lead: {
                id: form.leadId,
                name: form.leadName,
                location: form.leadPoint ? {latitude:form.leadPoint[0],longitude:form.leadPoint[1]} : undefined,
                city: form.city,
                uf: form.uf,
                address: form.address,
              },
            }
          : {}),
      };
      const r = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      if (form.mode === "schedule") {
        setMonth(form.scheduled_at.slice(0, 7));
        setSelectedDay(form.scheduled_at.slice(0, 10));
        setQuery("");
        setFilter("all");
      }
      if(scheduleOnly){await onScheduled?.();return;}
      setForm(null);
      setMessage(
        form.mode === "schedule"
          ? "Visita agendada."
          : "Visita realizada registrada.",
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(v: SalesVisit) {
    if (!confirm("Cancelar este agendamento? O histórico será mantido."))
      return;
    setBusy(true);
    try {
      const r = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          id: v.id,
          version: v.version,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (form && !confirm("Sair sem salvar o formulário?")) return;
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw Error("Não foi possível sair.");
      location.assign("/vendas/entrar");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeMonth(step: number) {
    const [y, m] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 7));
    setSelectedDay(new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 10));
  }
  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const count = new Date(y, m, 0).getDate(),
      offset = new Date(y, m - 1, 1).getDay();
    return [
      ...Array(offset).fill(""),
      ...Array.from(
        { length: count },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      ),
    ];
  }, [month]);
  const renderVisit = (v: SalesVisit) => (
    <article className="sales-visit" key={v.id}>
      <div className="sales-between">
        <strong>{customerMap.get(v.customer_key)?.name}</strong>
        {v.purpose_name && <p>Finalidade: {v.purpose_name}</p>}
        <span
          className={
            "sales-badge " +
            (v.status === "completed"
              ? "current"
              : v.status === "cancelled"
                ? "neutral"
                : "planned")
          }
        >
          {v.status === "completed"
            ? "Realizada"
            : v.status === "cancelled"
              ? "Cancelada"
              : "Agendada"}
        </span>
      </div>
      <p>
        <CalendarDays size={15} />
        {display(v.scheduled_at)}
      </p>
      <p>
        {v.contact} ·{" "}
        <a href={"tel:" + v.phone.replace(/[^+\d]/g, "")}>{v.phone}</a>
      </p>
      {v.description && <p className="sales-long">{v.description}</p>}
      {v.completed_at && <p>Realizada em {display(v.completed_at)}</p>}
      {v.outcome && (
        <p className="sales-long">
          <b>Registro da visita:</b> {v.outcome}
        </p>
      )}
      {v.status === "scheduled" && (
        <div className="sales-visit-actions">
          <button
            className="sales-primary"
            disabled={busy || !online}
            onClick={() =>
              openForm("complete", customerMap.get(v.customer_key), v)
            }
          >
            <CheckCircle2 size={16} />
            Registrar realização
          </button>
          <button disabled={busy || !online} onClick={() => void cancel(v)}>
            <X size={17} />
            Cancelar
          </button>
        </div>
      )}
    </article>
  );
  return (
    <div className={scheduleOnly ? "sales-schedule-modal" : "sales-shell"}>
      {!scheduleOnly && <>
      <div className={"sales-connection " + (online ? "online" : "offline")}>
        <span>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}{" "}
          {online ? "Conectado" : "Sem internet · conecte-se para salvar"}
        </span>
        <button onClick={() => void logout()}>
          <LogOut size={16} />
          Sair
        </button>
      </div>
      <main className="field-app sales-app">
        <header className="field-header">
          <div>
            <small>PORTAL VENDEDOR RJ</small>
            <h1>{home ? "Seu dia em campo" : "Minhas visitas"}</h1>
            <p className="field-user">{data?.name || "Portal Vendedor RJ"}</p>
          </div>
          <div className="sales-actions">
            <button
              aria-label="Atualizar visitas"
              disabled={loading}
              onClick={() => void reload()}
            >
              <RefreshCw size={19} className={loading ? "sales-spin" : ""} />
            </button>
            {!home && <button aria-label="Voltar ao início" onClick={() => setHome(true)}><ArrowLeft size={19} /></button>}
          </div>
        </header>
        {home ? <>
          {error && <p role="alert" className="sales-error">{error}</p>}
          {loading && !data && <p role="status">Carregando seu portal…</p>}
          <nav className="field-home" aria-label="Serviços do portal">
            <button disabled={!data} onClick={() => setHome(false)}>
              <CalendarDays /><span><b>Visitas</b><small>Sua carteira de clientes, agenda e visitas</small></span><ChevronDown />
            </button>
            <button disabled><Wallet /><span><b>Controle de Despesas</b><small>Em breve</small></span></button>
          </nav>
        </> : <>
        <div className="sales-actions sales-primary-actions">
          <button
            className="sales-primary"
            disabled={!data || !online}
            onClick={() => openForm("schedule")}
          >
            <Plus size={18} />
            Agendar visita
          </button>
          <button
            disabled={!data || !online}
            onClick={() => openForm("history")}
          >
            <History size={18} />
            Registrar visita realizada
          </button>
        </div>
        <nav className="sales-tabs" aria-label="Visões de visitas">
          {[
            ["summary", "Resumo", BarChart3],
            ["list", "Lista", List],
            ["calendar", "Calendário", CalendarDays],
            ["map", "Mapa", MapPin],
          ].map(([key, label, Icon]) => {
            const I = Icon as typeof List;
            return (
              <button
                key={key as string}
                aria-pressed={tab === key}
                onClick={() => setTab(key as string)}
              >
                <I size={17} />
                {label as string}
              </button>
            );
          })}
        </nav>
        {error && (
          <p role="alert" className="sales-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="sales-success">
            {message}
          </p>
        )}
        {loading && !data && (
          <p role="status">Carregando sua carteira de clientes…</p>
        )}
        {data && (
          <>
            {!customers.length && (
              <section className="sales-panel sales-empty">
                <Users size={32} />
                <h2>Sua carteira começa aqui</h2>
                <p>
                  Peça ao administrador para vincular seu usuário como vendedor
                  na divisão comercial. Os clientes das cidades vinculadas
                  aparecerão automaticamente.
                </p>
                <p>Mesmo sem carteira, você pode agendar uma visita buscando em toda a base de clientes ou cadastrar um novo Lead.</p>
              </section>
            )}
            {tab === "summary" && (
              <>
                <div className="sales-kpis">
                  {(
                    [
                      ["all", "Clientes na carteira", portfolio.length, Users],
                      ["leads", "Leads na carteira", customers.filter(c => c.lead).length, UserPlus],
                      [
                        "current",
                        "Visitas em dia",
                        counts.current,
                        CheckCircle2,
                      ],
                      ["due", "Próximas do vencimento", counts.due, Clock3],
                      ["overdue", "Visitas vencidas", counts.overdue, History],
                    ] as const
                  ).map(([key, label, value, Icon]) => (
                    <button
                      key={key}
                      className={"sales-kpi " + key}
                      onClick={() => {
                        setFilter(key);
                        setListMode("customers");
                        setTab("list");
                      }}
                    >
                      <span>
                        <Icon size={18} />
                        {label}
                      </span>
                      <strong>{value}</strong>
                      <small>{key === "leads" ? "Ver Leads" : "Ver clientes"}</small>
                    </button>
                  ))}
                </div>
                <div className="sales-overview">
                  <section className="sales-panel">
                    <h2>Saúde da carteira</h2>
                    <p className="sales-muted">
                      Última visita realizada · ciclo de 6 meses
                    </p>
                    {(["current", "due", "overdue"] as const).map((key) => (
                      <div className="sales-chart-row" key={key}>
                        <span>{healthLabels[key]}</span>
                        <div className="sales-track">
                          <i
                            className={key}
                            style={{
                              width: portfolio.length
                                ? `${(counts[key] / portfolio.length) * 100}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <b>{counts[key]}</b>
                      </div>
                    ))}
                    <p className="sales-muted">
                      Próxima do vencimento a partir de 5 meses. Sem histórico
                      de visita: vencida.
                    </p>
                  </section>
                  <section className="sales-panel">
                    <h2>Atividade comercial</h2>
                    <div className="sales-mini-kpis">
                      <div>
                        <b>{doneMonth}</b>
                        <span>realizadas neste mês</span>
                      </div>
                      <div>
                        <b>{planned.length}</b>
                        <span>agendadas em aberto</span>
                      </div>
                      <div>
                        <b>
                          {
                            planned.filter(
                              (v) => v.scheduled_at < new Date().toISOString(),
                            ).length
                          }
                        </b>
                        <span>agendamentos atrasados</span>
                      </div>
                      <div>
                        <b>
                          {portfolio.length
                            ? Math.round(
                                (counts.current / portfolio.length) * 100,
                              )
                            : 0}
                          %
                        </b>
                        <span>da carteira em dia</span>
                      </div>
                    </div>
                  </section>
                </div>
                <section className="sales-panel">
                  <h2>Visitas realizadas nos últimos 6 meses</h2>
                  <div className="sales-month-chart">
                    {monthSeries.map((m) => (
                      <div key={m.key}>
                        <b>{m.count}</b>
                        <div className="sales-month-track">
                          <i
                            style={{
                              height: `${(m.count / maxMonthly) * 100}%`,
                            }}
                          />
                        </div>
                        <span>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="sales-panel">
                  <h2>Próximas visitas</h2>
                  {planned
                    .filter((v) => v.scheduled_at >= new Date().toISOString())
                    .sort((a, b) =>
                      a.scheduled_at.localeCompare(b.scheduled_at),
                    )
                    .slice(0, 5)
                    .map(renderVisit)}
                  {!planned.some(
                    (v) => v.scheduled_at >= new Date().toISOString(),
                  ) && (
                    <p className="sales-muted">
                      Nenhuma visita futura agendada.
                    </p>
                  )}
                </section>
              </>
            )}
            {tab !== "summary" && (
              <div className="sales-filters">
                <label>
                  <Search size={17} />
                  Pesquisar cliente, documento ou cidade
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Digite para pesquisar"
                  />
                </label>
                <label>
                  Situação da carteira
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Todas</option>
                    <option value="leads">Somente Leads</option>
                    {Object.entries(healthLabels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {tab === "list" && (
              <>
                <div className="sales-actions sales-list-tabs">
                  <button
                    aria-pressed={listMode === "customers"}
                    onClick={() => setListMode("customers")}
                  >
                    Clientes ({filtered.length})
                  </button>
                  <button
                    aria-pressed={listMode === "visits"}
                    onClick={() => setListMode("visits")}
                  >
                    Visitas ({visitRows.length})
                  </button>
                </div>
                {listMode === "customers" ? (
                  <div className="sales-customer-grid">
                    {filtered.map((c) => (
                      <article
                        key={c.key}
                        className={"sales-customer " + c.health}
                      >
                        <div className="sales-between">
                          <strong>{c.name}</strong>
                          <span className={"sales-badge " + c.health}>
                            {healthLabels[c.health]}
                          </span>
                        </div>
                        <p>
                          {c.city} / {c.uf} {c.document && "· " + c.document}
                        </p>
                        <p className="sales-muted">
                          {c.lastVisit
                            ? "Última visita: " + display(c.lastVisit)
                            : "Nenhuma visita realizada registrada"}
                        </p>
                        {planned.filter((v) => v.customer_key === c.key)
                          .length > 0 && (
                          <p className="sales-scheduled">
                            <CalendarDays size={15} />
                            Possui visita agendada
                          </p>
                        )}
                        <div className="sales-customer-actions">
                          <button
                            className="sales-primary"
                            disabled={!online}
                            onClick={() => openForm("schedule", c)}
                          >
                            <CalendarDays size={17} />
                            Agendar
                          </button>
                          <button onClick={() => setDetail(c)}>
                            <History size={17} />
                            Ver histórico
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <section className="sales-panel sales-visits-list">
                    {visitRows.map(renderVisit)}
                  </section>
                )}
                {!(listMode === "customers"
                  ? filtered.length
                  : visitRows.length) && (
                  <p className="sales-empty">
                    Nenhum resultado para os filtros selecionados.
                  </p>
                )}
              </>
            )}
            {tab === "calendar" && (
              <section className="field-calendar" aria-label="Calendário de visitas">
                <div className="field-calendar-heading">
                  <button aria-label="Mês anterior" onClick={() => changeMonth(-1)}>
                    <ChevronLeft size={18} />
                  </button>
                  <strong aria-live="polite">
                    {new Date(month + "-01T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}
                  </strong>
                  <button aria-label="Próximo mês" onClick={() => changeMonth(1)}>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }}>Hoje</button>
                </div>
                <div className="field-calendar-grid">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => (
                    <span className="field-calendar-weekday" key={day}>{day}</span>
                  ))}
                  {days.map((day, i) => {
                    const daily = visitRows.filter(v => v.status === "scheduled" && brazilDay(v.scheduled_at) === day);
                    return day ? (
                      <button key={day} aria-pressed={day === selectedDay}
                        aria-current={day === today ? "date" : undefined}
                        aria-label={`${day.split("-").reverse().join("/")}: ${daily.length} visitas`}
                        className={daily.length > 0 && day < today ? "field-calendar-overdue" : ""}
                        onClick={() => setSelectedDay(day)}>
                        <span>{Number(day.slice(-2))}</span>
                        {daily.length > 0 && <small>{daily.length} visita{daily.length > 1 ? "s" : ""}</small>}
                      </button>
                    ) : <span key={"blank" + i} />;
                  })}
                </div>
                <h2 className="field-calendar-selected">
                  {selectedDay ? "Visitas de " + selectedDay.split("-").reverse().join("/") : "Agendadas no mês"}
                </h2>
                <div className="sales-calendar-actions">
                  {selectedDay && (
                    <button onClick={() => setSelectedDay("")}>
                      <CalendarDays size={17} />
                      Ver todo o mês
                    </button>
                  )}
                  <button className="sales-primary" disabled={!online} onClick={() => openForm("schedule")}>
                    <Plus size={17} />
                    Agendar visita
                  </button>
                </div>
                {visitRows
                  .filter(
                    (v) =>
                      v.status === "scheduled" &&
                      (selectedDay
                        ? brazilDay(v.scheduled_at) === selectedDay
                        : brazilDay(v.scheduled_at).startsWith(month)),
                  )
                  .map(renderVisit)}

              </section>
            )}
            {tab === "map" && (
              <SalesVisitsMap
                sellers={data.sellers}
                customers={filtered}
                visits={visits}
                onSelect={selectMap}
                onEquipment={selectEquipment}
              />
            )}
          </>
        )}
        </>}
        <footer className="sales-footer">
          Portal Vendedor RJ · Horários de Brasília · Acesso on-line
        </footer>
      </main>
      </>}
      {meterForm && (
        <div className="sales-overlay">
          <section className="sales-dialog" role="dialog" aria-modal="true" aria-label="Registrar horímetro">
            <div className="sales-between"><h2>Registrar horímetro atual</h2><button aria-label="Fechar" disabled={meterBusy} onClick={() => setMeterForm(null)}><X /></button></div>
            <p>{meterForm.customer.name}</p>
            <p><strong>{meterForm.equipment.id} · {meterForm.equipment.name}</strong></p>
            <p>Último horímetro: {meterForm.equipment.meter == null ? "Não informado" : meterForm.equipment.meter.toLocaleString("pt-BR") + " h"}</p>
            <p>Última coleta: {meterForm.equipment.meterDate ? meterForm.equipment.meterDate.split("-").reverse().join("/") : "Não registrada"}</p>
            <form onSubmit={async e => {
              e.preventDefault(); if (meterBusy) return; setMeterBusy(true); setMeterError("");
              try {
                const response = await fetch("/api/visits", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"meter",customer_key:meterForm.customer.key,equipment:meterForm.equipment.id,version:meterForm.equipment.version ?? null,meter:Number(meterValue),meterDate})});
                const result = await response.json(); if (!response.ok) throw Error(result.error);
                setMeterForm(null); setMessage("Horímetro registrado no módulo de Equipamentos."); await reload();
              } catch (error) { setMeterError((error as Error).message); } finally { setMeterBusy(false); }
            }}>
              <label>Horímetro atual (h)<input autoFocus required type="number" min={meterForm.equipment.meter ?? 0} max="100000000" step="any" value={meterValue} onChange={e => setMeterValue(e.target.value)} /></label>
              <label>Data da coleta<input required type="date" max={today} value={meterDate} onChange={e => setMeterDate(e.target.value)} /></label>
              {meterError && <p role="alert" className="sales-error">{meterError}</p>}
              <div className="sales-actions"><button type="button" disabled={meterBusy} onClick={() => setMeterForm(null)}>Cancelar</button><button className="sales-primary" disabled={meterBusy || !online}>{meterBusy ? "Salvando…" : "Salvar horímetro"}</button></div>
            </form>
          </section>
        </div>
      )}
      {detail && !form && (
        <div className="sales-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Histórico do cliente"
            className="sales-dialog"
          >
            <div className="sales-between">
              <h2>{detail.name}</h2>
              <button
                aria-label="Fechar histórico"
                onClick={() => setDetail(null)}
              >
                <X />
              </button>
            </div>
            <p>
              {detail.address} · {detail.city}/{detail.uf}
            </p>
            <div className="sales-actions">
              <button
                disabled={!online}
                onClick={() => openForm("schedule", detail)}
              >
                Agendar visita
              </button>
              <button
                disabled={!online}
                onClick={() => openForm("history", detail)}
              >
                Registrar visita realizada
              </button>
            </div>
            {visits
              .filter((v) => v.customer_key === detail.key)
              .map(renderVisit)}
            {!visits.some((v) => v.customer_key === detail.key) && (
              <p>Nenhuma visita registrada por você para este cliente.</p>
            )}
          </section>
        </div>
      )}
      {form && (
        <div className="sales-overlay">
          <form
            className="sales-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Formulário de visita"
            onSubmit={save}
          >
            <div className="sales-between">
              <div>
                <small>PORTAL VENDAS RJ</small>
                <h2>
                  {form.mode === "schedule"
                    ? "Agendar visita"
                    : "Registrar visita realizada"}
                </h2>
              </div>
              <button
                type="button"
                disabled={busy}
                aria-label="Fechar formulário"
                onClick={() => {
                  if (confirm("Fechar sem salvar?")) {setForm(null);if(scheduleOnly)onClose?.();}
                }}
              >
                <X />
              </button>
            </div>
            {error && (
              <p role="alert" className="sales-error">
                {error}
              </p>
            )}
            {scheduleOnly && <p className="sales-muted">A visita será registrada em seu nome.</p>}
            {loading && <p role="status">Carregando dados do agendamento…</p>}
            {form.mode !== "complete" ? (
              <>
                <label className="sales-check">
                  <input
                    type="checkbox"
                    checked={form.lead}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lead: e.target.checked,
                        leadPoint: undefined,
                        customer_key: "",
                      })
                    }
                  />
                  Novo cliente fora da base (Lead)
                </label>
                {form.lead ? (
                  <div className="sales-form-grid sales-lead-fields">
                    <label>
                      Nome do Lead
                      <input
                        required
                        maxLength={180}
                        value={form.leadName}
                        onChange={(e) =>
                          setForm({ ...form, leadName: e.target.value })
                        }
                      />
                    </label>
                    <SalesCustomerLocation key={form.leadId} draft onSaved={reload}
                      customer={{key:form.leadId,name:form.leadName,document:"",city:form.city,uf:form.uf,address:"",lead:true,latitude:null,longitude:null,lastVisit:null,health:"overdue"}}
                      onPoint={leadPoint=>void selectLeadPoint(leadPoint)}>
                    <section className="sales-lead-address" aria-label="Endereço do Lead">
                      <div className="sales-lead-address-heading"><strong>Endereço do Lead</strong></div>
                      {leadAddressStatus && <p className="sales-muted" role="status">{leadAddressStatus}</p>}
                      {!editingLeadAddress ? <dl><div><dt>Cidade / UF</dt><dd>{form.city ? `${form.city} / ${form.uf}` : "Localização ainda não definida"}</dd></div><div><dt>Endereço</dt><dd>{form.address || "Não identificado"}</dd></div></dl> : <div className="sales-form-grid">
                    <label>
                      Cidade
                      <input
                        required
                        maxLength={150}
                        value={form.city}
                        onChange={(e) =>
                          setForm({ ...form, city: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      UF
                      <select
                        aria-label="UF"
                        value={form.uf}
                        onChange={(e) =>
                          setForm({ ...form, uf: e.target.value })
                        }
                      >
                        {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                          .split(" ")
                          .map((uf) => (
                            <option key={uf}>{uf}</option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Endereço
                      <input
                        maxLength={300}
                        value={form.address}
                        onChange={(e) =>
                          setForm({ ...form, address: e.target.value })
                        }
                      />
                    </label>
                      </div>}
                    <div className="sales-lead-address-actions"><button type="button" onClick={()=>setEditingLeadAddress(!editingLeadAddress)}><Pencil size={14}/>{editingLeadAddress ? "Concluir edição" : "Editar endereço"}</button></div>
                    </section>
                    </SalesCustomerLocation>
                  </div>
                ) : (
                  <>
                    <div className="sales-customer-picker-row">
                      <SalesCustomerSelect customers={outsidePortfolio ? allCustomers : customers} value={form.customer_key}
                        onChange={customer_key => setForm({ ...form, customer_key })} />
                      <label className="sales-customer-scope"><input type="checkbox" checked={outsidePortfolio} onChange={e=>{setOutsidePortfolio(e.target.checked);setForm({...form,customer_key:""});if(e.target.checked)void loadAllCustomers();}}/><span>Base completa de clientes</span></label>
                    </div>
                    {customerLoading && <p role="status">Carregando clientes…</p>}
                  </>
                )}
              </>
            ) : (
              <p>
                <strong>{customerMap.get(form.customer_key)?.name}</strong>
              </p>
            )}
            {!form.lead && formCustomer && (
              <SalesCustomerLocation key={form.customer_key} customer={formCustomer!} onSaved={async()=>{await reload();if(outsidePortfolio)await loadAllCustomers()}} />
            )}
            <div className="sales-form-grid">
              <label>
                {form.mode === "schedule"
                  ? "Data e hora agendada"
                  : "Data e hora da realização"}
                <input
                  required
                  type="datetime-local"
                  max={form.mode !== "schedule" ? localNow() : undefined}
                  value={form.scheduled_at}
                  onChange={(e) =>
                    setForm({ ...form, scheduled_at: e.target.value })
                  }
                />
              </label>
              {form.mode !== "complete" && <label>Finalidade da Visita
                <select aria-label="Finalidade da Visita" required value={form.purpose_id} onChange={e=>setForm({...form,purpose_id:e.target.value})}>
                  <option value="">Selecione a finalidade</option>
                  {(data?.purposes || []).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <small>{data?.purposes?.find(p=>p.id===form.purpose_id)?.description}</small>
              </label>}
              {form.mode !== "complete" && (
                <>
                  <label>
                    Pessoa que receberá a visita
                    <input
                      required
                      maxLength={160}
                      value={form.contact}
                      onChange={(e) =>
                        setForm({ ...form, contact: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Telefone de contato
                    <input
                      required
                      type="tel"
                      maxLength={40}
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      placeholder="(49) 99999-9999"
                    />
                  </label>
                </>
              )}
            </div>
            {form.mode !== "complete" && (
              <label>
                Descrição / objetivo da visita
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
            )}
            {form.mode !== "schedule" && (
              <label>
                Registro da visita e próximos passos
                <textarea
                  required
                  rows={5}
                  maxLength={10000}
                  value={form.outcome}
                  onChange={(e) =>
                    setForm({ ...form, outcome: e.target.value })
                  }
                />
              </label>
            )}
            <p className="sales-muted">
              Horários de Brasília. Visitas anteriores podem ser registradas com
              a data real de realização.
            </p>
            <button
              type="submit"
              className="sales-primary"
              disabled={busy || !online || loading || !data}
            >
              {busy
                ? "Salvando…"
                : form.mode === "schedule"
                  ? "Salvar agendamento"
                  : "Salvar visita realizada"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
