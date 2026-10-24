"use client";
import { matchesSearch } from "@/lib/filters";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteHeader from "./site-header";
import {
  BarChart3,
  Users,
  List,
  CalendarDays,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Settings,
  Plus,
  X,
} from "lucide-react";
import {
  brazilDay,
  healthLabels,
  type SalesVisit,
  type VisitCustomer,
  type VisitsData,
} from "@/lib/visits/model";
import { lastSeen } from "@/lib/last-seen";
import VisitAdminActions from "./visit-admin-actions";
import VisitsPeriodCalendar from "./visits-period-calendar";
import VisitTaskButton from "./visit-task-button";
import SalesVisits from "./sales-visits";
import SalesVisitsMap from "./sales-visits-map";
import "./field-app.css";
import "./sales-visits.css";
import "./sales-visits-management.css";
const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Não registrada";
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const labels = {
  scheduled: "Agendada",
  completed: "Realizada",
  cancelled: "Cancelada",
};
function SellerPhoto({id,name}:{id:string;name:string}) {
  const [failed,setFailed]=useState(false);
  const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  return <span className="sales-seller-photo" aria-hidden="true">{failed ? initials : <img src={`/api/users/photo?email=${encodeURIComponent(id)}`} alt="" width={44} height={44} loading="lazy" onError={()=>setFailed(true)}/>}</span>;
}
export default function SalesVisitsManagement() {
  const [calendarView,setCalendarView]=useState<"month"|"week"|"day">("month");
  const [filtersExpanded,setFiltersExpanded]=useState(false);
  const [data, setData] = useState<VisitsData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("overview"),
    [seller, setSeller] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState("");
  const [month, setMonth] = useState(() => brazilDay(new Date()).slice(0, 7)),
    [day, setDay] = useState("");
  const [detail, setDetail] = useState<VisitCustomer | null>(null);
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [meterForm,setMeterForm] = useState<{customer:VisitCustomer;equipment:NonNullable<VisitCustomer["equipment"]>[number]} | null>(null);
  const [meterValue,setMeterValue]=useState("");
  const [meterDate, setMeterDate] = useState("");
  const [meterError,setMeterError]=useState("");
  const [meterBusy,setMeterBusy]=useState(false);
  const [scheduling,setScheduling]=useState(false);
  const [message,setMessage]=useState("");
  const selectEquipment=useCallback((customer:VisitCustomer,equipment:NonNullable<VisitCustomer["equipment"]>[number])=>{
    setMeterForm({customer,equipment}); setMeterDate(brazilDay(new Date()));setMeterValue("");setMeterError("");setMessage("");
  },[]);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/visits/management", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) setData(null);
        throw Error(b.error);
      }
      setData(b);
      setError("");
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60000);
    return () => clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    setPage(0);
  }, [seller, query, status, from, until]);
  const today = brazilDay(new Date(now));
  const customers = data?.customers || [],
    visits = data?.visits || [],
    sellers = data?.sellers || [];
  const customerMap = new Map(customers.map((c) => [c.key, c]));
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));
  const customerMatches = (c: VisitCustomer) =>
    matchesSearch(fold(`${c.name} ${c.tradeName || ""} ${c.document} ${c.city} ${c.uf}`), fold(query));
  const periodInvalid = !!(from && until && from > until);
  const filteredVisits = visits.filter((v) => {
    const c = customerMap.get(v.customer_key);
    const date = brazilDay(v.completed_at || v.scheduled_at);
    return (
      !periodInvalid &&
      (!seller || v.seller === seller) &&
      (!status || v.status === status) &&
      (!query ||
        (c
          ? customerMatches(c)
          : matchesSearch(fold(v.customer_key), fold(query)))) &&
      (!from || date >= from) &&
      (!until || date <= until)
    );
  });
  const portfolio = customers.filter(
    (c) =>
      !c.lead && c.in_portfolio !== false &&
      (!seller || c.seller_ids?.includes(seller)) &&
      customerMatches(c),
  );
  const completed = filteredVisits.filter((v) => v.status === "completed");
  const scheduled = filteredVisits.filter((v) => v.status === "scheduled");
  const overdue = scheduled.filter((v) => Date.parse(v.scheduled_at) < now);
  const selectedSeller = sellerMap.get(seller);
  const mapCustomers = useMemo(() => {
    const relevant = new Set(
      (data?.visits || [])
        .filter((v) => !seller || v.seller === seller)
        .map((v) => v.customer_key),
    );
    return (data?.customers || []).filter(
      (c) =>
        (!seller || c.seller_ids?.includes(seller) || relevant.has(c.key)) &&
        matchesSearch(fold(`${c.name} ${c.tradeName || ""} ${c.document} ${c.city} ${c.uf}`), fold(query)),
    );
  }, [data, seller, query]);
  const mapSellers = useMemo(
    () => (data?.sellers || []).filter((s) => !seller || s.id === seller),
    [data, seller],
  );
  const selectCustomer = useCallback((c: VisitCustomer) => setDetail(c), []);
  const selectSeller = (id: string) => {
    setSeller(id);
    setTab("overview");
    setQuery("");
    setStatus("");
  };
  const chart = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = today.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 6 + i, 1));
    const key = date.toISOString().slice(0, 7);
    return {
      label: date.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      count: completed.filter((v) => brazilDay(v.completed_at!).startsWith(key))
        .length,
    };
  });
  const maxChart = Math.max(1, ...chart.map((x) => x.count));
  const monthDate = new Date(month + "-01T12:00:00Z"),
    first = monthDate.getUTCDay(),
    days = new Date(
      Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
    ).getUTCDate();
  const moveMonth = (delta: number) => {
    setMonth(
      new Date(
        Date.UTC(
          monthDate.getUTCFullYear(),
          monthDate.getUTCMonth() + delta,
          1,
        ),
      )
        .toISOString()
        .slice(0, 7),
    );
    setDay("");
  };
  const renderVisit = (v: SalesVisit) => (
    <article className="sales-visit" key={v.id}>
      <div className="sales-between">
        <strong>
          {customerMap.get(v.customer_key)?.name ||
            "Cliente não disponível · " + v.customer_key}
        </strong>
        <span
          className={
            "sales-badge " +
            (v.status === "completed"
              ? "current"
              : v.status === "cancelled"
                ? "neutral"
                : "scheduled")
          }
        >
          {labels[v.status]}
        </span>
      </div>
      <p>
        <b>Vendedor:</b>{" "}
        {sellerMap.get(v.seller || "")?.name || v.seller || "Não informado"}
      </p>
      <p>
        <CalendarDays size={15} />
        {dateTime(v.scheduled_at)}
      </p>
      {v.status === "scheduled" && Date.parse(v.scheduled_at) < now && (
        <p className="sales-management-overdue">Agendamento atrasado</p>
      )}
      <p>
        {v.contact} · {v.phone}
      </p>
      {v.purpose_name && <p>Finalidade: {v.purpose_name}</p>}
      {v.description && <p className="sales-long">{v.description}</p>}
      {v.completed_at && <p>Realizada em {dateTime(v.completed_at)}</p>}
      {v.outcome && (
        <p className="sales-long">
          <b>Registro da visita:</b> {v.outcome}
        </p>
      )}
      {data?.canEditVisits && v.status !== "cancelled" && <VisitTaskButton visit={v} customer={customerMap.get(v.customer_key)?.name || v.customer_key}/>}
      {data?.canEditVisits && <VisitAdminActions visit={v} customer={customerMap.get(v.customer_key)?.name || v.customer_key} purposes={data.purposes || []} onSaved={async message=>{setMessage(message);await reload()}}/>}
    </article>
  );
  const calendarVisits = filteredVisits
    .filter(
      (v) =>
        brazilDay(v.scheduled_at).startsWith(month) &&
        (!day || brazilDay(v.scheduled_at) === day),
    )
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return (
    <div className="sales-shell">
      <SiteHeader active="visitsManagement" moduleId="visitas" />
      <main className="field-app sales-app sales-management">
        <header className="sales-management-header">
          <div>
            <h1>Gestão de Visitas</h1>
            <p>Acompanhe a carteira e as visitas de todos os vendedores.</p>
          </div>
          <div className="sales-actions">
            <button className="sales-primary" onClick={()=>setScheduling(true)}><Plus size={18}/>Agendar visita</button>
            <Link href="/visitas/gestao/configuracoes" title="Configurações de Visitas" aria-label="Configurações de Visitas"><Settings size={20}/></Link>
          </div>
        </header>
        {error && (
          <p role="alert" className="sales-error">
            {error}
          </p>
        )}
        {!data && loading && <p role="status">Carregando gestão de visitas…</p>}
        {data && (
          <>
            <section
              className="sales-panel sales-management-filters"
              aria-label="Filtros da gestão"
            >
              <button type="button" className="sales-management-filter-toggle" aria-expanded={filtersExpanded} aria-controls="sales-management-filter-content" onClick={()=>setFiltersExpanded(!filtersExpanded)}>
                <span><SlidersHorizontal size={17}/>Filtros de pesquisa
                  {[seller,query,status,from || until].filter(Boolean).length > 0 && <b className="sales-filter-count">{[seller,query,status,from || until].filter(Boolean).length}</b>}
                </span>
                <span className="sales-filter-toggle-action">{filtersExpanded ? "Ocultar" : "Expandir"}<ChevronDown size={17} className={filtersExpanded ? "expanded" : ""}/></span>
              </button>
              {!filtersExpanded && <div className="sales-filter-summary">
                {seller && <span>{sellerMap.get(seller)?.name || seller}</span>}
                {query && <span>Cliente: {query}</span>}
                {status && <span>{labels[status as keyof typeof labels]}</span>}
                {(from || until) && <span>{from ? from.split("-").reverse().join("/") : "Sem início"} até {until ? until.split("-").reverse().join("/") : "Sem fim"}</span>}
                {![seller,query,status,from,until].some(Boolean) && <small>Todos os vendedores · Todos os períodos</small>}
                {periodInvalid && <small role="alert">Período inválido. Expanda os filtros para corrigir as datas.</small>}
              </div>}
              <div id="sales-management-filter-content" className="sales-management-filter-content" hidden={!filtersExpanded}>
              <div className="sales-filter-main">
              <label>
                Vendedor
                <select
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                >
                  <option value="">Todos os vendedores</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.enabled === false ? " · Inativo" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pesquisar cliente
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nome, documento ou cidade"
                />
              </label>
              <label>
                Status da visita
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Todos</option>
                  {Object.entries(labels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              </div>
              <div className="sales-filter-period-row">
                <fieldset className="sales-filter-period"><legend><CalendarDays size={15}/>Período das visitas</legend>
              <label>
                De
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
                </fieldset>
              <button
                onClick={() => {
                  setSeller("");
                  setQuery("");
                  setStatus("");
                  setFrom("");
                  setUntil("");
                }}
                className="sales-filter-reset"
              >
                <X size={16}/> Limpar filtros
              </button>
              </div>
              <p className="sales-muted sales-filter-help">
                O período usa a data de realização para visitas realizadas e a
                data agendada para as demais. A carteira representa a situação
                atual.
              </p>
              {periodInvalid && (
                <p role="alert" className="sales-error">
                  A data inicial deve ser anterior ou igual à final.
                </p>
              )}
              </div>
            </section>
            <nav
              className="sales-management-tabs"
              aria-label="Visões de gestão"
            >
              {[
                ["overview", "Visão geral", BarChart3],
                ["sellers", "Vendedores", Users],
                ["visits", "Visitas", List],
                ["calendar", "Calendário", CalendarDays],
                ["map", "Mapa", MapPin],
              ].map(([key, label, Icon]) => {
                const I = Icon as typeof Users;
                return (
                  <button
                    key={String(key)}
                    aria-pressed={tab === key}
                    onClick={() => setTab(String(key))}
                  >
                    <I size={17} />
                    {String(label)}
                  </button>
                );
              })}
            </nav>
            {selectedSeller && (
              <section className="sales-management-profile">
                <div className="sales-profile-identity">
                  <SellerPhoto key={selectedSeller.id} id={selectedSeller.id} name={selectedSeller.name}/>
                  <div>
                  <h2>{selectedSeller.name}</h2>
                  <p className="sales-profile-status-line">
                    <span className={"sales-profile-status " + (selectedSeller.enabled !== false && selectedSeller.online ? "online" : "offline")}>
                      <i aria-hidden="true"/>{selectedSeller.enabled === false ? "Inativo" : selectedSeller.online ? "Online" : "Offline"}
                    </span>
                    <span>Visto por último: {selectedSeller.last_seen_at ? lastSeen(selectedSeller.last_seen_at, now) : "Não registrado"}</span>
                  </p>
                </div>
                </div>
                <button onClick={() => setSeller("")}>
                  Ver todos os vendedores
                </button>
              </section>
            )}
            {tab === "overview" && (
              <>
                <div className="sales-management-kpis">
                  {[
                    [
                      "Clientes na carteira",
                      portfolio.filter((c) => !c.lead).length,
                    ],
                    ["Leads", customers.filter(c=>c.lead && (!seller || c.seller_ids?.includes(seller)) && customerMatches(c)).length],
                    ["Visitas realizadas", completed.length],
                    ["Agendadas em aberto", scheduled.length],
                    ["Agendamentos atrasados", overdue.length],
                    [
                      "Visitas canceladas",
                      filteredVisits.filter((v) => v.status === "cancelled")
                        .length,
                    ],
                  ].map(([label, count]) => (
                    <section className="sales-panel" key={label}>
                      <span>{label}</span>
                      <strong>{count}</strong>
                    </section>
                  ))}
                </div>
                <div className="sales-management-charts">
                  <section className="sales-panel">
                    <h2>Situação da carteira</h2>
                    <p className="sales-muted">
                      Somente clientes da carteira. Sem visita registrada: vencida.
                    </p>
                    {Object.entries(healthLabels).map(([key, label]) => {
                      const count = portfolio.filter(
                        (c) => c.health === key,
                      ).length;
                      return (
                        <div className="sales-chart-row" key={key}>
                          <span>{label}</span>
                          <div className="sales-management-track">
                            <i
                              className={key}
                              style={{
                                width: `${portfolio.length ? (count / portfolio.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <b>{count}</b>
                        </div>
                      );
                    })}
                    <p className="sales-muted">
                      {portfolio.filter((c) => !c.seller_ids?.length).length}{" "}
                      clientes sem vendedor vinculado na divisão comercial.
                    </p>
                  </section>
                  <section className="sales-panel">
                    <h2>Visitas realizadas por mês</h2>
                    <p className="sales-muted">
                      Últimos seis meses, respeitando os filtros.
                    </p>
                    {chart.map((item) => (
                      <div className="sales-chart-row" key={item.label}>
                        <span>{item.label}</span>
                        <div className="sales-management-track">
                          <i
                            style={{
                              width: `${(item.count / maxChart) * 100}%`,
                            }}
                          />
                        </div>
                        <b>{item.count}</b>
                      </div>
                    ))}
                  </section>
                </div>
                <section className="sales-panel sales-visits-list">
                  <h2>Agendamentos que precisam de atenção</h2>
                  <p className="sales-muted">
                    Até 10 agendamentos atrasados, começando pelos mais antigos.
                  </p>
                  {[...overdue]
                    .sort((a, b) =>
                      a.scheduled_at.localeCompare(b.scheduled_at),
                    )
                    .slice(0, 10)
                    .map(renderVisit)}
                  {!overdue.length && (
                    <p>Nenhum agendamento atrasado nos filtros selecionados.</p>
                  )}
                </section>
              </>
            )}
            {tab === "sellers" && (
              <section className="sales-panel">
                <h2>Comparativo por vendedor</h2>
                <p className="sales-muted">
                  Clique em um vendedor para analisar sua carteira. Visitas
                  respeitam período, cliente e status selecionados.
                </p>
                <div className="sales-management-table">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Vendedor",
                          "Carteira",
                          "Situação da carteira",
                          "Realizadas",
                          "Agendadas",
                          "Atrasadas",
                          "Última visita realizada",
                        ].map((t) => (
                          <th key={t}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sellers
                        .filter((s) => !seller || s.id === seller)
                        .map((s) => {
                          const list = filteredVisits.filter(
                              (v) => v.seller === s.id,
                            ),
                            own = portfolio.filter((c) =>
                              c.seller_ids?.includes(s.id),
                            ),
                            last = list
                              .filter((v) => v.completed_at)
                              .sort((a, b) =>
                                b.completed_at!.localeCompare(a.completed_at!),
                              )[0];
                          return (
                            <tr key={s.id}>
                              <td>
                                <div className="sales-seller-identity">
                                  <SellerPhoto id={s.id} name={s.name}/>
                                  <div><button className="sales-seller-name" onClick={() => selectSeller(s.id)}>{s.name}</button>
                                    <span className={"sales-seller-presence " + (s.enabled !== false && s.online ? "online" : "offline")}>
                                      <i/>{s.enabled === false ? "Inativo" : s.online ? "Online" : "Offline"}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td><div className="sales-portfolio-count"><b>{own.filter(c=>!c.lead).length}</b><span>clientes</span></div><small>{own.filter(c=>c.lead).length} Leads</small></td>
                              <td><div className="sales-health-counts">
                                {(["current","due","overdue"] as const).map(health=><span className={"sales-health-count " + health} key={health}><b>{own.filter(c=>c.health===health).length}</b>{healthLabels[health]}</span>)}
                              </div></td>
                              <td>
                                {
                                  list.filter((v) => v.status === "completed")
                                    .length
                                }
                              </td>
                              <td>
                                {
                                  list.filter((v) => v.status === "scheduled")
                                    .length
                                }
                              </td>
                              <td>
                                {
                                  list.filter(
                                    (v) =>
                                      v.status === "scheduled" &&
                                      Date.parse(v.scheduled_at) < now,
                                  ).length
                                }
                              </td>
                              <td>{dateTime(last?.completed_at || null)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {!sellers.length && <p>Nenhum vendedor cadastrado.</p>}
              </section>
            )}
            {tab === "visits" && (
              <section className="sales-panel sales-visits-list">
                <h2>Visitas ({filteredVisits.length})</h2>
                {filteredVisits
                  .slice(page * 25, (page + 1) * 25)
                  .map(renderVisit)}
                {!filteredVisits.length && (
                  <p>Nenhuma visita nos filtros selecionados.</p>
                )}
                {filteredVisits.length > 25 && (
                  <div className="sales-actions">
                    <button
                      disabled={!page}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Anterior
                    </button>
                    <span>
                      Página {page + 1} de{" "}
                      {Math.ceil(filteredVisits.length / 25)}
                    </span>
                    <button
                      disabled={(page + 1) * 25 >= filteredVisits.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </button>
                  </div>
                )}
              </section>
            )}
            {tab === "calendar" && (
              <section className="field-calendar">
                <div className="sales-actions visit-calendar-modes">{(["month","week","day"] as const).map(mode=><button key={mode} aria-pressed={calendarView===mode} onClick={()=>setCalendarView(mode)}>{mode==="month"?"Mês":mode==="week"?"Semana":"Dia"}</button>)}</div>{calendarView!=="month"?<VisitsPeriodCalendar mode={calendarView} visits={filteredVisits} renderVisit={renderVisit}/>:<>
<div className="field-calendar-heading">
                  <button
                    aria-label="Mês anterior"
                    onClick={() => moveMonth(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <strong>
                    {monthDate.toLocaleDateString("pt-BR", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </strong>
                  <button aria-label="Próximo mês" onClick={() => moveMonth(1)}>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={() => {
                      setMonth(today.slice(0, 7));
                      setDay(today);
                    }}
                  >
                    Hoje
                  </button>
                </div>
                <div className="field-calendar-grid">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                    (d) => (
                      <span className="field-calendar-weekday" key={d}>
                        {d}
                      </span>
                    ),
                  )}
                  {Array.from({ length: first }, (_, i) => (
                    <span key={`blank${i}`} />
                  ))}
                  {Array.from({ length: days }, (_, i) => {
                    const d = `${month}-${String(i + 1).padStart(2, "0")}`,
                      rows = filteredVisits.filter(
                        (v) => brazilDay(v.scheduled_at) === d,
                      );
                    return (
                      <button
                        key={d}
                        aria-pressed={day === d}
                        aria-current={today === d ? "date" : undefined}
                        onClick={() => setDay(d)}
                      >
                        <span>{i + 1}</span>
                        {rows.length > 0 && (
                          <small>{rows.length} visita(s)</small>
                        )}
                      </button>
                    );
                  })}
                </div>
                <h2 className="field-calendar-selected">
                  {day
                    ? `Visitas de ${day.split("-").reverse().join("/")}`
                    : "Visitas do mês"}
                </h2>
                <p className="sales-muted">
                  Distribuição pela data agendada; inclui realizadas e
                  canceladas conforme os filtros.
                </p>
                {day && (
                  <button onClick={() => setDay("")}>Ver todo o mês</button>
                )}
                {calendarVisits.map(renderVisit)}
                {!calendarVisits.length && <p>Nenhuma visita neste período.</p>}
              </>}
</section>
            )}
            {tab === "map" && (
              <>
                <p className="sales-muted">
                  Mapa da carteira atual e dos clientes com histórico. Vendedor
                  e pesquisa filtram os clientes; período e status filtram as
                  visitas indicadas. Localização dos vendedores atualiza ao
                  atualizar os dados.
                </p>
                <SalesVisitsMap
                  customers={mapCustomers}
                  visits={filteredVisits}
                  sellers={mapSellers}
                  onSelect={selectCustomer}
                  onEquipment={selectEquipment}
                  customerActionLabel="Ver cliente"
                />
              </>
            )}
          </>
        )}
        <footer className="sales-footer">
          Gestão de Visitas · Horários de Brasília · Atualização automática a
          cada minuto
        </footer>
        {message && <p role="status" className="sales-success">{message}</p>}
        {meterForm && <div className="sales-overlay"><section className="sales-dialog" role="dialog" aria-modal="true" aria-label="Registrar horímetro">
          <div className="sales-between"><h2>Registrar horímetro atual</h2><button aria-label="Fechar horímetro" disabled={meterBusy} onClick={()=>setMeterForm(null)}><X/></button></div>
          <p>{meterForm.customer.name}</p><p><strong>{meterForm.equipment.id} · {meterForm.equipment.name}</strong></p>
          <p>Último horímetro: {meterForm.equipment.meter == null ? "Não informado" : meterForm.equipment.meter.toLocaleString("pt-BR")+" h"}</p>
          <p>Última coleta: {meterForm.equipment.meterDate ? meterForm.equipment.meterDate.split("-").reverse().join("/") : "Não registrada"}</p>
          <form onSubmit={async e=>{
            e.preventDefault();if(meterBusy)return;setMeterBusy(true);setMeterError("");
            try{const r=await fetch("/api/visits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"meter",management:true,customer_key:meterForm.customer.key,equipment:meterForm.equipment.id,version:meterForm.equipment.version ?? null,meter:Number(meterValue),meterDate})});
              const b=await r.json();if(!r.ok)throw Error(b.error);setMeterForm(null);setMessage("Horímetro atualizado no módulo de Equipamentos.");await reload();
            }catch(error){setMeterError((error as Error).message)}finally{setMeterBusy(false)}
          }}>
            <label>Horímetro atual (h)<input autoFocus required type="number" min={meterForm.equipment.meter ?? 0} max="100000000" step="any" value={meterValue} onChange={e=>setMeterValue(e.target.value)}/></label>
            <label>Data da coleta<input required type="date" max={today} value={meterDate} onChange={e => setMeterDate(e.target.value)} /></label>
            {meterError && <p role="alert" className="sales-error">{meterError}</p>}
            <div className="sales-actions"><button type="button" disabled={meterBusy} onClick={()=>setMeterForm(null)}>Cancelar</button><button className="sales-primary" disabled={meterBusy}>{meterBusy?"Salvando…":"Salvar horímetro"}</button></div>
          </form>
        </section></div>}
        {detail && (
          <div className="sales-overlay">
            <section
              className="sales-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Histórico do cliente"
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
                {detail.city}/{detail.uf} · {healthLabels[detail.health]}
              </p>
              <p>
                Vendedores da carteira:{" "}
                {detail.seller_ids
                  ?.map((id) => sellerMap.get(id)?.name || id)
                  .join(", ") || "Sem vínculo"}
              </p>
              <p>Última visita: {dateTime(detail.lastVisit)}</p>
              <h3>Histórico de visitas</h3>
              {visits
                .filter(
                  (v) =>
                    v.customer_key === detail.key &&
                    (!seller || v.seller === seller),
                )
                .map(renderVisit)}
              {!visits.some(
                (v) =>
                  v.customer_key === detail.key &&
                  (!seller || v.seller === seller),
              ) && <p>Nenhuma visita registrada.</p>}
            </section>
          </div>
        )}
      </main>
      {scheduling && <SalesVisits scheduleOnly onClose={()=>setScheduling(false)} onScheduled={async()=>{setScheduling(false);setMessage("Visita agendada.");await reload();}}/>}
    </div>
  );
}
