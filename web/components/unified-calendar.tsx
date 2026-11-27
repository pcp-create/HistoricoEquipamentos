"use client";
import ModuleHeaderActions from "./module-header-actions";
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Wrench,
  MapPin,
  ClipboardList,
} from "lucide-react";
import CalendarAppointmentForm from "./calendar-appointment-form";
import ActionNotice from "./action-notice";
import {
  calendarDay,
  calendarRange,
  calendarSources,
  filterCalendarEvents,
  shiftDay,
  type CalendarEvent,
  type CalendarSource,
} from "@/lib/calendar/model";
import "./unified-calendar.css";
const icons = { operations: Wrench, visits: MapPin, tasks: ClipboardList, appointments: CalendarDays };
const stateLabels = {
  pending: "Pendente",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const operationStatuses: Record<string, string> = {
  executing: "Em execução",
  awaiting_review: "Aguardando revisão",
  reviewed: "Revisada",
  awaiting_execution: "Aguardando execução",
  scheduled: "Programada",
};
export default function UnifiedCalendar({
  general = false,
  initialSource = "all",
  renderEvent,
  onOpen,
  revision = 0,
  fallbackEvents = [],
  initialDay,
  onDayChange,
  taskEvents,
}: {
  general?: boolean;
  initialSource?: CalendarSource | "all";
  renderEvent?: (event: CalendarEvent) => ReactNode;
  onOpen?: (event: CalendarEvent) => void;
  revision?: unknown;
  fallbackEvents?: CalendarEvent[];
  initialDay?: string;
  onDayChange?: (day: string) => void;
  taskEvents?: CalendarEvent[];
}) {
  const [appointment,setAppointment]=useState<CalendarEvent|"new"|null>(null);
  const [identity,setIdentity]=useState({email:"",canManage:false});
  const [message,setMessage]=useState("");
  const [employee,setEmployee]=useState("me");
  const [employees,setEmployees]=useState<{id:string;name:string}[]>([]);
  const [day, setDay] = useState(calendarDay),
    [view, setView] = useState<"month" | "week" | "day">("month"),
    [source, setSource] = useState<string>(initialSource),
    [state, setState] = useState("all"),
    [search, setSearch] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [failed, setFailed] = useState(false),
    [updated, setUpdated] = useState(""),
    [loadedRange, setLoadedRange] = useState("");
  useEffect(() => {
    if (initialDay) setDay(calendarDay(initialDay));
  }, [initialDay]);
  useEffect(() => onDayChange?.(day), [day, onDayChange]);
  const range = calendarRange(day, view);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setFailed(false);
    fetch(`/api/calendar?appointments=1&start=${range.start}&end=${range.end}${general?"&employee="+encodeURIComponent(employee):""}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.events))
          throw Error(data.error || "Não foi possível atualizar o calendário.");
        if (!controller.signal.aborted) {
          setEvents(data.events);
          setEmployees(data.employees || []);
          setIdentity({email:data.email,canManage:!!data.canManageAppointments});
          setLoadedRange(range.start + range.end + employee);
          setUpdated(data.updatedAt);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setError(e.message || "Não foi possível atualizar o calendário.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range.start, range.end, retry, revision, general, employee]);
  useEffect(() => {
    const update = () => setRetry((r) => r + 1);
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
    };
  }, []);
  const currentEvents = loadedRange === range.start + range.end + employee ? events : [];
  const availableEvents =
    failed && !currentEvents.length
      ? fallbackEvents.filter(
          (event) => event.day >= range.start && event.day <= range.end,
        )
      : currentEvents;
  // The task module supplies its already-authorized, filtered rows so its team
  // and equipment filters keep their existing scope. The general agenda stays personal.
  const scopedEvents = taskEvents
    ? [
        ...availableEvents.filter((event) => event.source !== "tasks"),
        ...taskEvents.filter(
          (event) => event.day >= range.start && event.day <= range.end,
        ),
      ]
    : availableEvents;
  const visible = filterCalendarEvents(scopedEvents, source, state, search);
  const selected = visible.filter((e) =>
    view === "month" ? e.day === day : true,
  );
  function move(delta: number) {
    if (view === "month") {
      const date = new Date(day.slice(0, 7) + "-01T12:00:00Z");
      date.setUTCMonth(date.getUTCMonth() + delta);
      setDay(date.toISOString().slice(0, 10));
    } else setDay(shiftDay(day, delta * (view === "week" ? 7 : 1)));
  }
  const days = Array.from(
    {
      length:
        Math.round(
          (Date.parse(range.end) - Date.parse(range.start)) / 86400000,
        ) + 1,
    },
    (_, i) => shiftDay(range.start, i),
  );
  const title =
    view === "month"
      ? new Date(range.start + "T12:00:00Z").toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : view === "week"
        ? `${range.start.split("-").reverse().join("/")} a ${range.end.split("-").reverse().join("/")}`
        : day.split("-").reverse().join("/");
  function card(event: CalendarEvent) {
    const custom = renderEvent?.(event);
    if (custom)
      return (
        <div key={event.id} className="unified-calendar-custom">
          {custom}
        </div>
      );
    const Icon = icons[event.source];
    return (
      <article
        className={`unified-calendar-event unified-calendar-event--${event.source}`}
        key={event.id}
      >
        <Icon size={18} aria-hidden />
        <div>
          <small>
            {calendarSources[event.source]} · {event.appointment?.allDay?"Dia inteiro":event.time || "Sem horário"} ·{" "}
            {event.appointment ? ({personal:"Compromisso pessoal",leave:"Folga",vacation:"Férias",other:"Outro"} as Record<string,string>)[event.appointment.kind] : operationStatuses[event.status] || stateLabels[event.state]}
          </small>
          <strong>{event.title}</strong>
          {general && event.employee && <span>{event.employee}</span>}
          {event.customer && <span>{event.customer}</span>}
          {event.description && <p>{event.description}</p>}
        </div>
        {event.appointment ? <button type="button" onClick={()=>setAppointment(event)}>Abrir</button> : onOpen ? (
          <button type="button" onClick={() => onOpen(event)}>
            Abrir
          </button>
        ) : (
          <a href={event.href}>Abrir</a>
        )}
      </article>
    );
  }
  return (
    <section
      className="unified-calendar"
      aria-label="Calendário integrado"
      aria-busy={loading}
    >
      {message&&<ActionNotice type="success" onClose={()=>setMessage('')}>{message}</ActionNotice>}
      {appointment&&<CalendarAppointmentForm event={appointment==='new'?undefined:appointment} day={day} email={identity.email} employees={employees} canManage={identity.canManage} onClose={()=>setAppointment(null)} onSaved={()=>{setAppointment(null);setRetry(n=>n+1);setMessage('Compromisso atualizado.');}}/>}
      {general&&<button type="button" disabled={!identity.email||loading} onClick={()=>setAppointment('new')}>Novo compromisso</button>}
      <div className="unified-calendar-title">
        <h2>
          <CalendarDays size={21} />
          {taskEvents
            ? "Agenda de tarefas e compromissos"
            : general ? "Agenda integrada" : "Minha agenda integrada"}
        </h2>
        <a href="/calendario">Calendário geral</a>
      </div>
      <p>
        {taskEvents
          ? "Operações e visitas pessoais; tarefas conforme os filtros do módulo."
          : general ? "Compromissos de todos os módulos" : "Seus compromissos de todos os módulos"}{" "}
        · Horário de Brasília
      </p>
      <nav className="unified-calendar-sources" aria-label="Origem dos eventos">
        {[["all", "Todos"], ...Object.entries(calendarSources)].map(
          ([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={source === id}
              onClick={() => setSource(id)}
            >
              {label}
            </button>
          ),
        )}
      </nav>
      <div className="unified-calendar-filters">
        {general&&<label>Funcionário<select aria-label="Funcionário" value={employee} onChange={e=>setEmployee(e.target.value)}><option value="me">Meus eventos</option><option value="all">Todos os funcionários</option>{employees.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        <label>
          Pesquisar
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cliente, OS, tarefa ou descrição"
          />
        </label>
        <label>
          Situação
          <select
            aria-label="Situação dos eventos"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="pending">Pendentes</option>
            <option value="completed">Concluídos</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </label>
      </div>
      <label className="unified-calendar-date">
        Ir para a data
        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (e.target.value) setDay(e.target.value);
          }}
        />
      </label>
      <div className="unified-calendar-navigation">
        <div>
          <button
            type="button"
            aria-label="Período anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <strong aria-live="polite">{title}</strong>
          <button
            type="button"
            aria-label="Próximo período"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button type="button" onClick={() => setDay(calendarDay())}>
          Hoje
        </button>
        <ModuleHeaderActions><button title="Atualizar"
          type="button"
          aria-label="Atualizar calendário"
          onClick={() => setRetry((r) => r + 1)}
        >
          <RefreshCw size={16} />
        </button></ModuleHeaderActions>
        <div aria-label="Período do calendário">
          {(["month", "week", "day"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={mode === view}
              onClick={() => setView(mode)}
            >
              {mode === "month" ? "Mês" : mode === "week" ? "Semana" : "Dia"}
            </button>
          ))}
        </div>
      </div>
      <p className="unified-calendar-loading" role="status">
        {loading ? "Atualizando eventos…" : "\u00a0"}
      </p>
      {
        <>
          <div className="unified-calendar-grid" hidden={view !== "month"}>
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <span key={d}>{d}</span>
            ))}
            {Array.from(
              { length: new Date(range.start + "T12:00:00Z").getUTCDay() },
              (_, i) => (
                <span key={"empty" + i} />
              ),
            )}
            {days.map((date) => {
              const items = visible.filter((e) => e.day === date);
              const tone =
                items.some((e) => e.state === "pending") && date < calendarDay()
                  ? "overdue"
                  : items.some((e) => e.state === "completed") &&
                      items.every((e) => e.state !== "pending")
                    ? "completed"
                    : "";
              return (
                <button
                  className={"unified-calendar-day--" + tone}
                  type="button"
                  key={date}
                  aria-pressed={day === date}
                  aria-current={date === calendarDay() ? "date" : undefined}
                  aria-label={`${date.split("-").reverse().join("/")}: ${items.length} eventos`}
                  onClick={() => setDay(date)}
                >
                  <b>{Number(date.slice(-2))}</b>
                  <small>
                    {items.length
                      ? `${items.length} evento${items.length === 1 ? "" : "s"}`
                      : "\u00a0"}
                  </small>
                  <span className="unified-calendar-dots">
                    {(Object.keys(calendarSources) as CalendarSource[])
                      .filter((s) => items.some((e) => e.source === s))
                      .map((s) => (
                        <i
                          key={s}
                          className={"unified-calendar-dot--" + s}
                          title={calendarSources[s]}
                        />
                      ))}
                  </span>
                </button>
              );
            })}
          </div>
          {view === "month" ? (
            <>
              <h3>
                {day.split("-").reverse().join("/")} · {selected.length}{" "}
                {selected.length === 1 ? "evento" : "eventos"}
              </h3>
              {selected.map(card)}
              {!selected.length && (
                <p>Nenhum evento para esta data com os filtros selecionados.</p>
              )}
            </>
          ) : (
            days.map((date) => (
              <section key={date} className="unified-calendar-agenda-day">
                <h3>{date.split("-").reverse().join("/")}</h3>
                {visible.filter((e) => e.day === date).map(card)}
                {!visible.some((e) => e.day === date) && (
                  <p>Nenhum evento para esta data.</p>
                )}
              </section>
            ))
          )}
          {failed && fallbackEvents.length > 0 && (
            <p>Exibindo a programação técnica disponível neste dispositivo.</p>
          )}
          {updated && (
            <small>
              Última atualização:{" "}
              {new Date(updated).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </small>
          )}
        </>
      }
      <ActionNotice
        onClose={() => setError("")}
        actions={
          <button type="button" onClick={() => setRetry((r) => r + 1)}>
            Tentar novamente
          </button>
        }
      >
        {error}
      </ActionNotice>
    </section>
  );
}
