"use client";
import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  X,
  FileText,
  CircleCheck,
  Clock,
  Users,
  SlidersHorizontal,
} from "lucide-react";
import { userTaskColor } from "@/lib/tasks/user-color";
const localDay = (value: any) =>
  value
    ? new Date(value).toLocaleDateString("sv-SE", {
        timeZone: "America/Sao_Paulo",
      })
    : "";
const shift = (day: string, n: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const short = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);
export default function TaskCharts({
  tasks,
  users,
}: {
  tasks: any[];
  users: any[];
}) {
  const today = localDay(new Date());
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [origin, setOrigin] = useState("all"),
    [type, setType] = useState("all"),
    [priority, setPriority] = useState("all"),
    [status, setStatus] = useState("all"),
    [scope, setScope] = useState("pending"),
    [granularity, setGranularity] = useState("daily"),
    [search, setSearch] = useState(""),
    [responsible, setResponsible] = useState<string | null>(null);
  const valid = !!from && !!to && from <= to;
  const filtered = tasks.filter(
    (t) =>
      (origin === "all" || t.origin === origin) &&
      (type === "all" ||
        (String(t.source_key).startsWith("manual:")
          ? "manual"
          : "automatic") === type) &&
      (priority === "all" || t.priority === priority) &&
      (status === "all" || t.status === status) &&
      (!search ||
        `${t.title} ${t.customer || ""} ${t.equipment_name || ""} ${t.assignee_name || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR"))),
  );
  const within = (date: string) => valid && date >= from && date <= to;
  const opened = filtered.filter((t) => within(localDay(t.created_at))).length;
  const closed = filtered.filter(
    (t) => t.status === "completed" && within(localDay(t.completed_at)),
  ).length;
  const pending = filtered.filter((t) => t.status !== "completed");
  const active = new Set(
    pending.map((t) => t.assigned_to?.trim().toLowerCase()).filter(Boolean),
  ).size;
  const people = new Map<
    string,
    { name: string; count: number; color: string }
  >();
  const selected =
    scope === "pending"
      ? pending
      : scope === "completed"
        ? filtered.filter(
            (t) => t.status === "completed" && within(localDay(t.completed_at)),
          )
        : filtered.filter((t) => within(localDay(t.created_at)));
  for (const t of selected) {
    const key = t.assigned_to?.trim().toLowerCase() || "";
    if (!people.has(key)) {
      const u = users.find((u) => u.email?.trim().toLowerCase() === key);
      people.set(key, {
        name: key
          ? u?.display_name || t.assignee_name || "Funcionário"
          : "Não atribuído",
        count: 0,
        color: userTaskColor(key, u?.task_color || t.assignee_color),
      });
    }
    people.get(key)!.count++;
  }
  const bars = [...people.entries()].sort(
    (a, b) =>
      b[1].count - a[1].count || a[1].name.localeCompare(b[1].name, "pt-BR"),
  );
  const max = Math.ceil(Math.max(4, ...bars.map(([, p]) => p.count)) / 4) * 4;
  const days = valid
    ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
    : 0;
  const step =
    granularity === "weekly"
      ? Math.max(7, Math.ceil(days / 630) * 7)
      : Math.max(1, Math.ceil(days / 90));
  const series: {
    date: string;
    opened: number;
    closed: number;
    pending: number;
  }[] = [];
  // Reconstructed from creation and latest completion dates; deleted tasks and former reopening cycles are not available.
  const evolutionTasks = filtered.filter(
    (t) =>
      responsible === null ||
      (t.assigned_to?.trim().toLowerCase() || "") === responsible,
  );
  const responsibleName =
    responsible === null
      ? "Todos os responsáveis"
      : people.get(responsible)?.name ||
        users.find((u) => u.email?.trim().toLowerCase() === responsible)
          ?.display_name ||
        (responsible ? "Responsável selecionado" : "Não atribuído");
  const dated = evolutionTasks.map((t) => ({
    created: localDay(t.created_at),
    completed: t.status === "completed" ? localDay(t.completed_at) : "",
  }));
  for (let offset = 0; offset < days; offset += step) {
    const date = shift(from, offset),
      end = shift(from, Math.min(days - 1, offset + step - 1));
    let o = 0,
      c = 0,
      p = 0;
    for (const { created, completed } of dated) {
      if (created >= date && created <= end) o++;
      if (completed >= date && completed <= end) c++;
      if (created && created <= end && (!completed || completed > end)) p++;
    }
    series.push({ date, opened: o, closed: c, pending: p });
  }
  const peak =
    Math.ceil(Math.max(4, ...series.flatMap((d) => [d.opened, d.closed])) / 4) *
    4;
  const backlog =
    Math.ceil(Math.max(4, ...series.map((d) => d.pending)) / 4) * 4;
  const width = Math.max(620, series.length * 64 + 100),
    plot = width - 100,
    base = 240,
    height = 190;
  const x = (i: number) => 50 + ((i + 0.5) * plot) / Math.max(1, series.length);
  const line = series
    .map((d, i) => `${x(i)},${base - (d.pending / backlog) * height}`)
    .join(" ");
  return (
    <section className="task-analytics" aria-label="Indicadores de tarefas">
      <details className="filter-panel analytics-filter-panel">
        <summary className="filter-toggle">
          <span>
            <SlidersHorizontal size={17} aria-hidden="true" />
            Filtros de pesquisa
          </span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="analytics-filters">
          <div className="analytics-dates">
            <CalendarDays size={18} />
            <label>
              <span>De</span>
              <input
                aria-label="Data inicial do gráfico"
                type="date"
                value={from}
                max={to || today}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <span>→</span>
            <label>
              <span>Até</span>
              <input
                aria-label="Data final do gráfico"
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <label>
            Origem
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="all">Todas</option>
              {[...new Set<string>(tasks.map((t) => t.origin))]
                .sort()
                .map((o) => (
                  <option key={o}>{o}</option>
                ))}
            </select>
          </label>
          <label>
            Tipo
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Todos</option>
              <option value="manual">Manual</option>
              <option value="automatic">Automática</option>
            </select>
          </label>
          <label>
            Prioridade
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="all">Todas</option>
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todos</option>
              <option value="not_started">Não iniciado</option>
              <option value="in_progress">Em andamento</option>
              <option value="completed">Concluído</option>
            </select>
          </label>
          <div className="analytics-search">
            <label>
              Pesquisar
              <input
                value={search}
                placeholder="Tarefa, cliente, equipamento ou responsável"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setResponsible(null);
                setOrigin("all");
                setType("all");
                setPriority("all");
                setStatus("all");
                setSearch("");
                setFrom(today.slice(0, 7) + "-01");
                setTo(today);
              }}
            >
              <X size={15} aria-hidden="true" /> Limpar
            </button>
          </div>
        </div>
      </details>
      {!valid ? (
        <p role="alert">Selecione um período válido.</p>
      ) : (
        <>
          <div className="analytics-metrics">
            {[
              {
                label: "Tarefas abertas",
                hint: "no período",
                value: opened,
                Icon: FileText,
                tone: "blue",
              },
              {
                label: "Tarefas concluídas",
                hint: "no período",
                value: closed,
                Icon: CircleCheck,
                tone: "green",
              },
              {
                label: "Tarefas pendentes",
                hint: "atual · não concluídas",
                value: pending.length,
                Icon: Clock,
                tone: "amber",
              },
              {
                label: "Responsáveis ativos",
                hint: "com tarefas pendentes",
                value: active,
                Icon: Users,
                tone: "purple",
              },
            ].map(({ label, hint, value, Icon, tone }) => (
              <article className={"analytics-metric " + tone} key={label}>
                <span className="analytics-metric-icon">
                  <Icon size={23} />
                </span>
                <div>
                  <h3>{label}</h3>
                  <small>{hint}</small>
                  <strong>{value.toLocaleString("pt-BR")}</strong>
                </div>
              </article>
            ))}
          </div>
          <div className="analytics-charts">
            <section className="analytics-panel">
              <header>
                <div>
                  <h2>Tarefas por responsável</h2>
                  <p>
                    {scope === "pending"
                      ? "Total atual de tarefas não concluídas"
                      : "Tarefas no período selecionado"}
                  </p>
                </div>
                <select
                  aria-label="Tarefas por responsável"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="pending">Pendentes</option>
                  <option value="opened">Abertas</option>
                  <option value="completed">Concluídas</option>
                </select>
              </header>
              {!bars.length ? (
                <p className="analytics-empty">Nenhuma tarefa encontrada.</p>
              ) : (
                <div
                  className="analytics-scroll"
                  tabIndex={0}
                  aria-label="Barras por responsável"
                >
                  <svg
                    role="img"
                    aria-label="Quantidade de tarefas por responsável, com as cores dos perfis"
                    width={Math.max(600, bars.length * 85 + 60)}
                    height="315"
                    viewBox={`0 0 ${Math.max(600, bars.length * 85 + 60)} 315`}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <g key={i}>
                        <line
                          x1="45"
                          x2={Math.max(600, bars.length * 85 + 60) - 10}
                          y1={240 - i * 47.5}
                          y2={240 - i * 47.5}
                          stroke="#e2e8f0"
                          strokeDasharray="4 4"
                        />
                        <text x="38" y={244 - i * 47.5} textAnchor="end">
                          {Math.ceil((max * i) / 4)}
                        </text>
                      </g>
                    ))}
                    {bars.map(([key, p], i) => {
                      const slot =
                          (Math.max(600, bars.length * 85 + 60) - 60) /
                          bars.length,
                        cx = 50 + slot * (i + 0.5);
                      return (
                        <g
                          key={key}
                          role="button"
                          tabIndex={0}
                          aria-label={`Filtrar evolução por ${p.name}`}
                          aria-pressed={responsible === key}
                          className="analytics-person"
                          opacity={
                            responsible !== null && responsible !== key
                              ? 0.4
                              : 1
                          }
                          onClick={() =>
                            setResponsible(responsible === key ? null : key)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setResponsible(responsible === key ? null : key);
                            }
                          }}
                        >
                          <title>
                            {p.name}: {p.count}
                          </title>
                          <rect
                            data-responsible={key || "unassigned"}
                            x={cx - 22}
                            y={240 - (p.count / max) * 190}
                            width="44"
                            height={(p.count / max) * 190}
                            rx="4"
                            fill={p.color}
                          />
                          <text
                            x={cx}
                            y={232 - (p.count / max) * 190}
                            textAnchor="middle"
                            className="analytics-value"
                          >
                            {p.count}
                          </text>
                          <text x={cx} y="260" textAnchor="middle">
                            {p.name.split(" ").map((word, j) => (
                              <tspan key={j} x={cx} dy={j ? 13 : 0}>
                                {word}
                              </tspan>
                            ))}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </section>
            <section className="analytics-panel">
              <header>
                <div>
                  <h2>Abertas, concluídas e pendentes acumuladas</h2>
                  <p>Evolução das tarefas no período selecionado</p>
                  <div className="analytics-cross-filter" aria-live="polite">
                    <span>{responsibleName}</span>
                    {responsible !== null && (
                      <button
                        type="button"
                        onClick={() => setResponsible(null)}
                      >
                        <X size={13} aria-hidden="true" />
                        Limpar responsável
                      </button>
                    )}
                  </div>
                </div>
                <select
                  aria-label="Intervalo da evolução"
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value)}
                >
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                </select>
              </header>
              <div
                className="analytics-scroll"
                tabIndex={0}
                aria-label="Evolução das tarefas"
              >
                <svg
                  role="img"
                  aria-label="Barras de criação e conclusão e linha de pendências acumuladas"
                  width={width}
                  height="290"
                  viewBox={`0 0 ${width} 290`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <g key={i}>
                      <line
                        x1="45"
                        x2={width - 45}
                        y1={base - (i * height) / 4}
                        y2={base - (i * height) / 4}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                      />
                      <text
                        x="38"
                        y={base - (i * height) / 4 + 4}
                        textAnchor="end"
                      >
                        {Math.ceil((peak * i) / 4)}
                      </text>
                      <text
                        x={width - 35}
                        y={base - (i * height) / 4 + 4}
                        fill="#c08100"
                      >
                        {Math.ceil((backlog * i) / 4)}
                      </text>
                    </g>
                  ))}
                  {series.map((d, i) => (
                    <g key={d.date}>
                      <title>
                        {short(d.date)}: {d.opened} abertas, {d.closed}{" "}
                        concluídas, {d.pending} pendentes
                      </title>
                      <rect
                        x={x(i) - 20}
                        y={base - (d.opened / peak) * height}
                        width="16"
                        height={(d.opened / peak) * height}
                        fill="#5294f7"
                        rx="2"
                      />
                      <rect
                        x={x(i) + 4}
                        y={base - (d.closed / peak) * height}
                        width="16"
                        height={(d.closed / peak) * height}
                        fill="#35bd92"
                        rx="2"
                      />
                      <text
                        className="analytics-data-label"
                        data-series="opened"
                        x={x(i) - 12}
                        y={base - (d.opened / peak) * height - 7}
                        textAnchor="middle"
                        style={{ fill: "#2871cb" }}
                      >
                        {d.opened}
                      </text>
                      <text
                        className="analytics-data-label"
                        data-series="closed"
                        x={x(i) + 12}
                        y={base - (d.closed / peak) * height - 7}
                        textAnchor="middle"
                        style={{ fill: "#198563" }}
                      >
                        {d.closed}
                      </text>
                      {
                        <text x={x(i)} y="262" textAnchor="middle">
                          {short(d.date)}
                        </text>
                      }
                    </g>
                  ))}
                  <polyline
                    points={line}
                    fill="none"
                    stroke="#eaaa08"
                    strokeWidth="2"
                  />
                  {series.map((d, i) => {
                    const py = base - (d.pending / backlog) * height;
                    return (
                      <g key={d.date}>
                        <circle
                          cx={x(i)}
                          cy={py}
                          r="3"
                          fill="white"
                          stroke="#eaaa08"
                        >
                          <title>
                            {short(d.date)}: {d.pending} pendentes
                          </title>
                        </circle>
                        <text
                          className="analytics-data-label"
                          data-series="pending"
                          x={x(i)}
                          y={py - 24}
                          textAnchor="middle"
                          style={{ fill: "#a86f00" }}
                        >
                          {d.pending}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="analytics-legend">
                <span>
                  <i style={{ background: "#5294f7" }} />
                  Abertas
                </span>
                <span>
                  <i style={{ background: "#35bd92" }} />
                  Concluídas
                </span>
                <span>
                  <i style={{ background: "#eaaa08" }} />
                  Pendentes acumuladas · eixo direito
                </span>
              </div>
              <small className="analytics-footnote">
                Histórico estimado pelas datas de criação e última conclusão das
                tarefas disponíveis.{" "}
                {days > 90 && granularity === "daily"
                  ? "Períodos longos são agrupados para facilitar a leitura."
                  : ""}
              </small>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
