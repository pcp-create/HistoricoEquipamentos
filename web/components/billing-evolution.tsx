"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Download,
  RefreshCw,
  CalendarDays,
  Building2,
  Info,
  Database,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  ChartColumn,
  ChartLine,
} from "lucide-react";
import SiteHeader from "./site-header";
import BillingEvolutionDetail from "./billing-evolution-detail";
import {
  comparableGrowth,
  billingRecords,
  evolutionCompanies,
  monthNames,
  periodTotal,
  type EvolutionData,
  type EvolutionYear,
  type Cell,
} from "@/lib/billing-evolution/model";
import "./billing-evolution.css";
const money = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compact = (n: number) =>
  n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const percent = (n: number | null) =>
  n == null
    ? "—"
    : `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const palette = [
  "#2563a1",
  "#0e9c94",
  "#cc8b24",
  "#8b6bc7",
  "#e16e69",
  "#618b40",
  "#447fa6",
];
const sourceLabel = (cell: Cell) =>
  cell.source === "system"
    ? "Sistema integrado"
    : cell.source === "mixed"
      ? "Sistema + histórico"
      : "Histórico da planilha";
function Chart({
  rows,
  monthly,
  from,
  to,
  selectedYear,
  onSelectYear,
}: {
  rows: EvolutionYear[];
  monthly: boolean;
  from: number;
  to: number;
  selectedYear?: number;
  onSelectYear: (year: number) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(920);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const resize = () => {
      const box = element.getBoundingClientRect();
      if (box.width && box.height)
        setChartWidth(Math.round((box.width * 265) / box.height));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rows, monthly, from, to]);

  const amounts = monthly
    ? rows.flatMap((row) =>
        row.months
          .slice(from - 1, to)
          .map((cell) => cell.amount)
          .filter((v): v is number => v != null),
      )
    : rows
        .map((row) => periodTotal(row, from, to))
        .filter((v): v is number => v != null);
  if (!amounts.length)
    return (
      <p className="be-loading">
        Não há detalhamento para este gráfico no período selecionado. Consulte
        os totais anuais na tabela ou ajuste os filtros.
      </p>
    );
  const min = Math.min(0, ...amounts),
    max = Math.max(1, ...amounts),
    range = max - min;
  const y = (value: number) => 30 + ((max - value) / range) * 190,
    zero = y(0),
    w = chartWidth,
    left = 86,
    right = 20;
  const count = monthly ? to - from + 1 : rows.length,
    x = (index: number) =>
      left + ((index + 0.5) * (w - left - right)) / Math.max(1, count);
  const tooltip = (text: string) => ({
    onMouseEnter: () => setHover(text),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(text),
    onBlur: () => setHover(null),
  });
  return (
    <>
      <div className="be-chart-scroll">
        <svg
          className="be-chart"
          ref={chartRef}
          viewBox={`0 0 ${chartWidth} 265`}
          role={monthly ? "img" : "group"}
          aria-label={
            monthly
              ? "Comparativo mensal de faturamento por ano"
              : "Evolução dos totais de faturamento por ano"
          }
        >
          {[0, 1, 2, 3, 4].map((step) => {
            const value = max - (range * step) / 4;
            return (
              <g key={step}>
                <line
                  x1={left}
                  x2={w - right}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="#e8edf4"
                  strokeDasharray="4 5"
                />
                <text
                  x={left - 14}
                  y={y(value) + 4}
                  textAnchor="end"
                  className="be-axis"
                >
                  {compact(value)}
                </text>
              </g>
            );
          })}
          {monthly
            ? rows.map((row, index) => {
                const color = palette[index % palette.length];
                const cells = row.months.slice(from - 1, to);
                let path = "";
                cells.forEach((cell, i) => {
                  if (cell.amount != null)
                    path += `${i > 0 && cells[i - 1].amount != null ? "L" : "M"}${x(i)},${y(cell.amount)} `;
                });
                return (
                  <g key={row.year}>
                    <path
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth="2.5"
                    />
                    {cells.map((cell, i) =>
                      cell.amount == null ? null : (
                        <circle
                          key={i}
                          cx={x(i)}
                          cy={y(cell.amount)}
                          r="4"
                          fill={color}
                          stroke="white"
                          strokeWidth="2"
                          tabIndex={0}
                          {...tooltip(
                            `${monthNames[from - 1 + i]}/${row.year} · ${money(cell.amount)} · ${sourceLabel(cell)}`,
                          )}
                        >
                          <title>{`${monthNames[from - 1 + i]}/${row.year}: ${money(cell.amount)}`}</title>
                        </circle>
                      ),
                    )}
                  </g>
                );
              })
            : rows.map((row, i) => {
                const value = periodTotal(row, from, to);
                if (value == null) return null;
                return (
                  <g
                    key={row.year}
                    tabIndex={0}
                    role="button"
                    aria-label={`Selecionar ano ${row.year}`}
                    aria-pressed={row.year === selectedYear}
                    onClick={() => onSelectYear(row.year)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectYear(row.year);
                      }
                    }}
                    className="be-year-bar"
                    {...tooltip(
                      `${row.year} · ${money(value)}${row.annualOnly ? " · Somente histórico anual" : ""}`,
                    )}
                  >
                    <rect
                      x={
                        x(i) - Math.min(28, ((w - left - right) / count) * 0.28)
                      }
                      y={Math.min(y(value), zero)}
                      width={Math.min(56, ((w - left - right) / count) * 0.56)}
                      height={Math.max(2, Math.abs(zero - y(value)))}
                      rx="5"
                      fill={row.year === selectedYear ? "#2563a1" : "#9db6d0"}
                      opacity={row.year === selectedYear ? 1 : 0.82}
                    />
                    <title>{`${row.year}: ${money(value)}`}</title>
                    <text
                      x={x(i)}
                      y={value >= 0 ? y(value) - 9 : y(value) + 16}
                      textAnchor="middle"
                      className="be-value"
                    >
                      {compact(value)}
                    </text>
                  </g>
                );
              })}
          {(monthly
            ? monthNames.slice(from - 1, to)
            : rows.map((row) => String(row.year))
          ).map((label, i) => (
            <text
              key={label}
              {...(!monthly
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": `Selecionar rótulo do ano ${label}`,
                    "aria-pressed": Number(label) === selectedYear,
                    onClick: () => onSelectYear(Number(label)),
                    onKeyDown: (e: React.KeyboardEvent<SVGTextElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectYear(Number(label));
                      }
                    },
                    style: { cursor: "pointer" },
                  }
                : {})}
              x={x(i)}
              y="247"
              textAnchor="middle"
              className="be-axis"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
      <div className="be-chart-caption" aria-live="polite">
        {hover ||
          "Passe o cursor ou selecione um ponto para conferir os valores."}
      </div>
      {monthly && (
        <div className="be-legend">
          {rows.map((row, i) => (
            <span key={row.year}>
              <i style={{ background: palette[i % palette.length] }} />
              {row.year}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
export default function BillingEvolution() {
  const [data, setData] = useState<EvolutionData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [chosenYear, setChosenYear] = useState<number | null>(null);
  const [company, setCompany] = useState("all"),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [from, setFrom] = useState(1),
    [to, setTo] = useState(12),
    [monthly, setMonthly] = useState(false),
    [showGrowth, setShowGrowth] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/billing-evolution", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "Não foi possível carregar a evolução.");
        setData(result);
        const lastYear = Math.max(
          ...(result as EvolutionData).series.flatMap((series) =>
            series.years
              .filter((row) => row.total != null)
              .map((row) => row.year),
          ),
        );
        const defaultYear = Number.isFinite(lastYear)
          ? lastYear
          : Number(result.today.slice(0, 4));
        setStart((previous) => previous || Math.max(2010, defaultYear - 4));
        setEnd((previous) => previous || defaultYear);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  const allYears =
    data?.series.find((row) => row.company === company)?.years || [];
  const rows = useMemo(
    () => allYears.filter((row) => row.year >= start && row.year <= end),
    [allYears, start, end],
  );
  const [selection, setSelection] = useState<{
    year: number;
    from: number;
    to: number;
    value: number;
  } | null>(null);
  const records = billingRecords(rows, allYears, from, to);
  const latest = rows.at(-1),
    previous = allYears.find((row) => row.year === (latest?.year || 0) - 1),
    total = latest ? periodTotal(latest, from, to) : null,
    growth = latest ? comparableGrowth(latest, previous, from, to) : null;
  const available =
    latest?.months
      .map((cell, index) => ({ ...cell, index }))
      .filter(
        (cell) =>
          cell.amount != null && cell.index >= from - 1 && cell.index < to,
      ) || [];
  const best = available.reduce<(typeof available)[number] | null>(
    (best, cell) =>
      !best || (cell.amount ?? 0) > (best.amount ?? 0) ? cell : best,
    null,
  );
  const average =
    latest?.annualOnly && from === 1 && to === 12
      ? latest.average
      : total == null || !available.length
        ? null
        : total / available.length;
  const selectableYears = rows.filter(
    (row) => periodTotal(row, from, to) != null,
  );
  const participationYear =
    selectableYears.find((row) => row.year === chosenYear) ??
    selectableYears.at(-1);
  const participation =
    data?.series
      .filter((series) => series.company !== "all")
      .map((series) => {
        const row = series.years.find(
          (row) => row.year === participationYear?.year,
        );
        const values =
          row?.months
            .filter(
              (_, index) =>
                index >= from - 1 &&
                index < to &&
                participationYear?.months[index].amount != null,
            )
            .map((cell) => cell.amount) ?? [];
        return {
          company: series.company,
          value:
            participationYear?.annualOnly && row
              ? periodTotal(row, from, to)
              : values.some((value) => value != null)
                ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
                : null,
        };
      }) ?? [];
  const participationTotal = participation.reduce(
    (sum, row) => sum + (row.value ?? 0),
    0,
  );
  const name =
    evolutionCompanies.find((row) => row.id === company)?.name || "Grupo RJ";
  function exportCsv() {
    if (!data) return;
    const lines = [
      [
        "Mês",
        ...rows.flatMap((row) =>
          showGrowth ? [String(row.year), "Cresc. %"] : [String(row.year)],
        ),
      ],
      ...monthNames.slice(from - 1, to).map((month, i) => [
        month,
        ...rows.flatMap((row) => {
          const cell = row.months[from - 1 + i],
            prior = allYears.find((prior) => prior.year === row.year - 1)
              ?.months[from - 1 + i];
          const rate =
            cell.amount != null && prior?.amount != null && prior.amount > 0
              ? (cell.amount / prior.amount - 1) * 100
              : null;
          return showGrowth
            ? [
                cell.amount == null
                  ? ""
                  : cell.amount.toFixed(2).replace(".", ","),
                rate == null ? "" : rate.toFixed(2).replace(".", ","),
              ]
            : [
                cell.amount == null
                  ? ""
                  : cell.amount.toFixed(2).replace(".", ","),
              ];
        }),
      ]),
      [
        "Total",
        ...rows.flatMap((row) =>
          showGrowth
            ? [String(periodTotal(row, from, to) ?? "").replace(".", ","), ""]
            : [String(periodTotal(row, from, to) ?? "").replace(".", ",")],
        ),
      ],
    ];
    const csv =
      "\ufeff" +
      lines
        .map((line) =>
          line.map((value) => '"' + value.replace(/"/g, '""') + '"').join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `Evolução de Faturamento - ${name} - ${start}-${end}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="be-page">
      <SiteHeader active="billingEvolution" moduleId="crm" />
      <main className="be-main">
        <Link className="be-back" href="/modulos/crm">
          <ArrowLeft size={16} />
          Comercial
        </Link>
        <header className="be-heading">
          <div>
            <span className="be-eyebrow">DESEMPENHO COMERCIAL</span>
            <h1>Gráfico de Evolução</h1>
            <p>
              Faturamento líquido integrado e histórico preservado, mês a mês.
              Uma visão do crescimento de cada empresa e do grupo.
            </p>
          </div>
          <div className="be-actions">
            <button
              onClick={() => setRevision((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "be-spinning" : ""} />
              Atualizar
            </button>
            <button
              className="be-primary"
              disabled={!data || !rows.length}
              onClick={exportCsv}
            >
              <Download size={16} />
              Exportar tabela
            </button>
          </div>
        </header>
        <section className="be-filters" aria-label="Filtros da evolução">
          <label>
            <span>
              <Building2 size={14} />
              Empresa
            </span>
            <select
              aria-label="Empresa"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              {evolutionCompanies.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id === "all" ? "Todas as empresas · Grupo RJ" : row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <CalendarDays size={14} />
              Ano inicial
            </span>
            <select
              aria-label="Ano inicial"
              value={start}
              disabled={!data}
              onChange={(e) => {
                const value = Number(e.target.value);
                setStart(value);
                if (value > end) setEnd(value);
              }}
            >
              {allYears.map((row) => (
                <option key={row.year}>{row.year}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ano final</span>
            <select
              aria-label="Ano final"
              value={end}
              disabled={!data}
              onChange={(e) => {
                const value = Number(e.target.value);
                setEnd(value);
                if (value < start) setStart(value);
              }}
            >
              {allYears.map((row) => (
                <option key={row.year}>{row.year}</option>
              ))}
            </select>
          </label>
          <label>
            <span>De</span>
            <select
              aria-label="Mês inicial"
              value={from}
              onChange={(e) => {
                const value = Number(e.target.value);
                setFrom(value);
                if (value > to) setTo(value);
              }}
            >
              {monthNames.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Até</span>
            <select
              aria-label="Mês final"
              value={to}
              onChange={(e) => {
                const value = Number(e.target.value);
                setTo(value);
                if (value < from) setFrom(value);
              }}
            >
              {monthNames.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </select>
          </label>
        </section>
        {error && (
          <div className="be-warning" role="alert">
            {error}{" "}
            <button onClick={() => setRevision((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {loading && !data && (
          <div className="be-loading" role="status">
            <RefreshCw size={24} />
            Carregando histórico e faturamento integrado…
          </div>
        )}
        {data && (
          <>
            {data.warning && (
              <p className="be-warning" role="status">
                <Info size={16} />
                {data.warning}
              </p>
            )}
            <div className="be-context">
              <strong>{name}</strong>
              <span>
                {start} — {end} · {monthNames[from - 1]} a {monthNames[to - 1]}
              </span>
              <span className="be-source">
                <Database size={13} />
                Sistema integrado
              </span>
              <span className="be-source historical">
                <FileSpreadsheet size={13} />
                Histórico preservado
              </span>
            </div>
            <section
              className="be-metrics"
              aria-label="Indicadores de faturamento"
            >
              <article>
                <span>Faturamento em {latest?.year}</span>
                <strong>{money(total)}</strong>
                <small>
                  {available.length
                    ? `${available.length} meses com valores no período`
                    : latest?.annualOnly
                      ? "Histórico disponível somente no total anual"
                      : "Sem valores no período"}
                </small>
              </article>
              <article>
                <span>Variação sobre {previous?.year || "ano anterior"}</span>
                <strong
                  className={
                    growth == null
                      ? ""
                      : growth >= 0
                        ? "be-positive"
                        : "be-negative"
                  }
                >
                  {growth != null &&
                    (growth >= 0 ? (
                      <ArrowUpRight size={23} />
                    ) : (
                      <ArrowDownRight size={23} />
                    ))}
                  {percent(growth)}
                </strong>
                <small>Compara apenas os mesmos meses com dados</small>
              </article>
              <article>
                <span>Média mensal em {latest?.year}</span>
                <strong>{money(average)}</strong>
                <small>Meses disponíveis no período selecionado</small>
              </article>
              <article>
                <span>Melhor mês em {latest?.year}</span>
                <strong>{best ? monthNames[best.index] : "—"}</strong>
                <small>
                  {best
                    ? money(best.amount)
                    : "Sem detalhamento mensal disponível"}
                </small>
              </article>
            </section>
            <section className="be-card be-table-card">
              <header className="be-card-heading">
                <div>
                  <h2>Comparativo por mês e ano</h2>
                  <p>
                    O mesmo histórico da planilha, com os períodos integrados
                    atualizados pelo sistema.
                  </p>
                </div>
                <label className="be-growth-toggle">
                  <input
                    type="checkbox"
                    checked={showGrowth}
                    onChange={(e) => setShowGrowth(e.target.checked)}
                  />
                  Mostrar crescimento (%)
                </label>
              </header>
              <div
                className="be-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Tabela de evolução do faturamento"
              >
                <table data-growth={showGrowth ? "true" : "false"}>
                  <thead>
                    <tr>
                      <th rowSpan={2} scope="col">
                        Mês
                      </th>
                      {rows.map((row) => (
                        <th
                          key={row.year}
                          colSpan={showGrowth ? 2 : 1}
                          scope="colgroup"
                          className={
                            row.year === participationYear?.year
                              ? "be-latest"
                              : ""
                          }
                        >
                          <button
                            type="button"
                            className="be-year-select"
                            aria-label={`Selecionar participação de ${row.year}`}
                            aria-pressed={row.year === participationYear?.year}
                            disabled={periodTotal(row, from, to) == null}
                            onClick={() => setChosenYear(row.year)}
                          >
                            {row.year}
                          </button>
                          {row.year === Number(data.today.slice(0, 4)) && (
                            <small>Em andamento</small>
                          )}
                          {row.annualOnly && <small>Somente anual</small>}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {rows.flatMap((row) => [
                        <th key={row.year + "-value"} scope="col">
                          Faturamento
                        </th>,
                        ...(showGrowth
                          ? [
                              <th key={row.year + "-growth"} scope="col">
                                Cresc. %
                              </th>,
                            ]
                          : []),
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {monthNames.slice(from - 1, to).map((month, i) => (
                      <tr key={month}>
                        <th scope="row">{month}</th>
                        {rows.flatMap((row) => {
                          const cell = row.months[from - 1 + i],
                            prior = allYears.find(
                              (previous) => previous.year === row.year - 1,
                            )?.months[from - 1 + i],
                            growth =
                              cell.amount != null &&
                              prior?.amount != null &&
                              prior.amount > 0
                                ? (cell.amount / prior.amount - 1) * 100
                                : null;
                          const marks = records(
                            row.year,
                            from - 1 + i,
                            cell.amount,
                          );
                          return [
                            <td
                              key={row.year + "-value"}
                              className={
                                marks.includes("Recorde da base")
                                  ? "be-record-base"
                                  : marks.includes("Melhor do ano")
                                    ? "be-record-year"
                                    : marks.length
                                      ? "be-record-month"
                                      : ""
                              }
                              data-records={marks.join(", ")}
                              title={
                                cell.amount == null
                                  ? "Sem histórico mensal"
                                  : `${marks.length ? marks.join(" · ") + " · " : ""}${sourceLabel(cell)}${cell.count ? " · " + cell.count + " notas processadas" : ""}${cell.partial ? " · Histórico incompleto para alguma empresa" : ""}`
                              }
                            >
                              <span className="be-cell-value">
                                {marks.length > 0 && (
                                  <b
                                    className="be-record-icon"
                                    aria-label={marks.join(", ")}
                                  >
                                    {marks.includes("Recorde da base")
                                      ? "★"
                                      : marks.includes("Melhor do ano")
                                        ? "◆"
                                        : "●"}
                                  </b>
                                )}
                                {cell.amount != null && (
                                  <i
                                    className={
                                      "be-dot " +
                                      (cell.source === "spreadsheet"
                                        ? "historical"
                                        : cell.source === "mixed"
                                          ? "mixed"
                                          : "")
                                    }
                                  />
                                )}{" "}
                                {cell.amount == null ? (
                                  money(null)
                                ) : (
                                  <button
                                    type="button"
                                    className="be-value-link"
                                    aria-label={`Detalhar ${month}/${row.year}`}
                                    onClick={() =>
                                      setSelection({
                                        year: row.year,
                                        from: from + i,
                                        to: from + i,
                                        value: cell.amount!,
                                      })
                                    }
                                  >
                                    {money(cell.amount)}
                                  </button>
                                )}
                                {cell.partial && <sup>*</sup>}
                              </span>
                            </td>,
                            ...(showGrowth
                              ? [
                                  <td
                                    key={row.year + "-growth"}
                                    className={
                                      "be-growth " +
                                      (growth == null
                                        ? ""
                                        : growth >= 0
                                          ? "be-positive"
                                          : "be-negative")
                                    }
                                  >
                                    {percent(growth)}
                                  </td>,
                                ]
                              : []),
                          ];
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total do período</th>
                      {rows.flatMap((row) => [
                        <td key={row.year}>
                          <button
                            type="button"
                            className="be-value-link"
                            aria-label={`Detalhar total de ${row.year}`}
                            disabled={periodTotal(row, from, to) == null}
                            onClick={() =>
                              setSelection({
                                year: row.year,
                                from,
                                to,
                                value: periodTotal(row, from, to)!,
                              })
                            }
                          >
                            {money(periodTotal(row, from, to))}
                          </button>
                        </td>,
                        ...(showGrowth
                          ? [
                              <td
                                key={row.year + "-growth"}
                                className="be-growth"
                              >
                                {percent(
                                  comparableGrowth(
                                    row,
                                    allYears.find(
                                      (previous) =>
                                        previous.year === row.year - 1,
                                    ),
                                    from,
                                    to,
                                  ),
                                )}
                              </td>,
                            ]
                          : []),
                      ])}
                    </tr>
                    <tr>
                      <th>Média mensal</th>
                      {rows.flatMap((row) => {
                        const count = row.months
                            .slice(from - 1, to)
                            .filter((cell) => cell.amount != null).length,
                          total = periodTotal(row, from, to);
                        return [
                          <td key={row.year}>
                            {money(
                              row.annualOnly
                                ? from === 1 && to === 12
                                  ? row.average
                                  : null
                                : total != null && count
                                  ? total / count
                                  : null,
                            )}
                          </td>,
                          ...(showGrowth
                            ? [<td key={row.year + "-growth"}>—</td>]
                            : []),
                        ];
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div
                className="be-record-legend"
                aria-label="Legenda dos melhores valores"
              >
                <span className="be-record-month">● Melhor do mês</span>
                <span className="be-record-year">◆ Melhor do ano</span>
                <span className="be-record-base">★ Recorde da base</span>
                <small>
                  Mês: entre os anos exibidos · Ano: meses selecionados · Base:
                  todo o histórico mensal da empresa · Empates destacados
                </small>
              </div>
              <p className="be-table-note">
                <Info size={14} />
                “—” indica ausência de histórico; não significa faturamento
                zero. Variações totais comparam somente meses em comum. O mês
                atual está em andamento.
              </p>
            </section>
            <section className="be-card">
              <header className="be-card-heading">
                <div>
                  <h2>
                    {monthly ? "Comparativo mensal" : "Evolução do faturamento"}
                  </h2>
                  <p>
                    {monthly
                      ? "Compare a sazonalidade entre os anos selecionados."
                      : "Totais dos meses selecionados, por ano."}
                  </p>
                </div>
                <div
                  className="be-chart-toggle"
                  aria-label="Visualização do gráfico"
                >
                  <button
                    aria-pressed={!monthly}
                    onClick={() => setMonthly(false)}
                  >
                    <ChartColumn size={16} />
                    Anual
                  </button>
                  <button
                    aria-pressed={monthly}
                    onClick={() => setMonthly(true)}
                  >
                    <ChartLine size={16} />
                    Mensal
                  </button>
                </div>
              </header>
              <Chart
                rows={rows}
                monthly={monthly}
                from={from}
                to={to}
                selectedYear={participationYear?.year}
                onSelectYear={setChosenYear}
              />
            </section>
            {company === "all" && participationYear && (
              <section className="be-card">
                <header className="be-card-heading">
                  <div>
                    <h2>
                      Participação das empresas · {participationYear.year}
                    </h2>
                    <p>
                      Composição nos meses disponíveis do consolidado, dentro do
                      período selecionado.
                    </p>
                  </div>
                </header>
                <div className="be-company-grid">
                  {evolutionCompanies.slice(1).map((company, index) => {
                    const value =
                      participation.find((row) => row.company === company.id)
                        ?.value ?? null;
                    const share =
                      value != null && participationTotal > 0
                        ? (value / participationTotal) * 100
                        : 0;
                    return (
                      <article key={company.id}>
                        <span>
                          {company.name}
                          <b>
                            {share.toLocaleString("pt-BR", {
                              maximumFractionDigits: 1,
                            })}
                            %
                          </b>
                        </span>
                        <strong>{money(value)}</strong>
                        <div className="be-share-track">
                          <i
                            style={{
                              width: Math.max(0, Math.min(100, share)) + "%",
                              background: palette[index],
                            }}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            <details className="be-method">
              <summary>
                <Info size={16} />
                Origem dos dados e critérios do relatório
              </summary>
              <p>
                Faturamento líquido: total das notas processadas, não excluídas,
                menos as devoluções elegíveis do Comercial, pela data de
                emissão. Devoluções são descontadas no mês de sua emissão;
                projeções não entram no faturamento. O histórico da planilha
                mantém seus valores originais, sem composição de devoluções
                presumida. Notas repetidas entre contextos da integração são
                contadas uma única vez, seguindo a regra do módulo Comercial.
              </p>
              <p>
                Onde existe faturamento integrado, o sistema tem prioridade, sem
                somar o valor da planilha ao mesmo mês. As lacunas usam o
                histórico estático de <strong>{data.sourceFile}</strong>. O
                consolidado histórico da planilha é preservado nos meses sem
                dados integrados; meses com integração somam as empresas e seus
                históricos disponíveis. Um asterisco indica que falta histórico
                de alguma empresa.
              </p>
              <p>
                RJ: 2010 e 2011 possuem somente total e média anuais, sem
                distribuição mensal. Serrana iniciou em abril/2019 e Criciúma em
                julho/2024. Períodos sem detalhamento não são estimados.
              </p>
              <p>
                Última coleta da integração:{" "}
                {data.updatedAt
                  ? new Date(data.updatedAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })
                  : "Não confirmada"}
                . O histórico estático permanece inalterado.
              </p>
            </details>
          </>
        )}
        {data && selection && (
          <BillingEvolutionDetail
            data={data}
            company={company}
            selection={selection}
            onClose={() => setSelection(null)}
          />
        )}
      </main>
    </div>
  );
}
