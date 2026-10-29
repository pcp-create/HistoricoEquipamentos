"use client";
import {tableFilterValues} from "@/lib/table-filter-values";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Pencil, RefreshCw, SlidersHorizontal, ChevronRight, Link2, X } from "lucide-react";
import CommercialUpdateStatus from "./commercial-update-status";
import SiteHeader from "./site-header";
import OrderSearchSelect from "./order-search-select";
import CommercialPeriodFilter from "./commercial-period-filter";
import HistoryProgrammingAction from "./history-programming-action";
import OrderDetailLink from "./order-detail-link";
import OrderQuickEdit from "./order-quick-edit";
import OrderBillingDialog from "./order-billing-dialog";
import { billingLabels } from "@/lib/sales-projection/billing";
import ColumnFilter from "./territory-column-filter";
import type { ProjectionData } from "@/lib/sales-projection/store";
import { companies, type Detail } from "@/lib/sales-projection/model";
import "./sales-projection.css";
import "./territory-sheet.css";
import "./commercial-report.css";
const money = (n: unknown) =>
  Number(n || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
type Col = { key: string; label: string; type?: "date" | "money" };
const flowStages = [
  "Almoxarifado",
  "Compras",
  "Planejamento",
  "Comercial",
  "Faturamento",
];
const shared: Col[] = [
  { key: "company", label: "Empresa" },
  { key: "id", label: "Código" },
  { key: "name", label: "Cliente" },
];
const contractCols: Col[] = [
  ...shared,
  { key: "contractType", label: "Tipo de contrato" },
  { key: "installment", label: "Parcela atual/total" },
  { key: "amount", label: "Valor da parcela", type: "money" },
  { key: "start", label: "Início do contrato", type: "date" },
  { key: "end", label: "Fim do contrato", type: "date" },
  { key: "billed", label: "Faturado no mês", type: "money" },
  { key: "pending", label: "Saldo a faturar", type: "money" },
];
const salesCols: Col[] = [
  ...shared.map((c) => c.key === "name" ? { ...c, label: "Cliente / Equipamento" } : c),
  { key: "status", label: "Status OS / Programação" },
  { key: "orderType", label: "Tipo de OS" },
  { key: "flowStatus", label: "Status do fluxo" },
  { key: "expected", label: "Entrega prevista", type: "date" },
  { key: "amount", label: "Valor total", type: "money" },
  { key: "inWorkshop", label: "Equipamento em oficina?" },
  { key: "seller", label: "Vendedor" },
  { key: "billingState", label: "Conferência do faturamento" },
  { key: "billingAmount", label: "Notas válidas (acumulado)", type: "money" },
  { key: "billingBalance", label: "Saldo a conferir", type: "money" },
  { key: "billingDocuments", label: "Notas vinculadas" },
  { key: "modality", label: "Modalidade" },
  { key: "flowOwner", label: "Responsável do fluxo" },
  { key: "notes", label: "Observação" },
  { key: "opened", label: "Abertura", type: "date" },
  { key: "billedDate", label: "Faturamento", type: "date" },
];
function contractGroup(row: Detail) {
  const type = fold(String(row.fields?.contractType || ""));
  if (/manutencao/.test(type) || /^(1|6)(\s*-|$)/.test(type)) return "maintenance";
  return /locacao/.test(type) ? "rental" : "other";
}
function ContractSignal({ row, column, value }: { row: Detail; column: string; value: string }) {
  let tone = "";
  let label = "";
  if (column === "pending" && Math.round(Number(row.fields?.pending) * 100) > 0) {
    tone = "red";
    label = "Saldo pendente de faturamento";
  } else if (column === "billed") {
    const billed = Number(row.fields?.billed);
    if (Number.isFinite(billed)) {
      const covered = Math.round(billed * 100) >= Math.round(row.amount * 100);
      tone = covered ? "green" : "yellow";
      label = covered ? "Valor da parcela faturado" : "Faturamento menor que o valor da parcela";
    }
  } else if (column === "installment") {
    const match = String(row.fields?.installment || "").match(/^(\d+)\/(\d+)$/);
    if (match) {
      const current = Number(match[1]), total = Number(match[2]);
      if (current > 0 && total >= current) {
        tone = current === total ? "red" : current === total - 1 ? "yellow" : "green";
        label = current === total ? "Última parcela" : current === total - 1 ? "Penúltima parcela" : "Contrato com mais de uma parcela restante";
      }
    }
  }
  return tone ? (
    <span className={`cr-contract-signal ${tone}`} title={label} aria-label={`${value} — ${label}`}>
      {value}
    </span>
  ) : <>{value}</>;
}

export function reportValue(row: Detail, key: string): string | number {
  if (key === "seller") return String(row.fields?.seller || "").replace(/^\s*\d+\s*[-–—·:]\s*/, "").replace(/\s*[-–—·:]\s*\d+\s*$/, "").trim();
  if (key === "name" && row.kind.startsWith("sales"))
    return [row.name, row.fields?.equipment].filter(Boolean).join(" · ");

  if (key === "billingState")
    return row.billing ? billingLabels[row.billing.state] : "Sem análise";
  if (key === "billingAmount") return row.billing?.billed ?? "";
  if (key === "billingBalance") return row.billing?.balance ?? "";
  if (key === "billingDocuments")
    return (
      row.billing?.documents
        .map(
          (d) =>
            `${d.number} (ID ${d.id}, ${d.date}, ${d.status}, ${money(d.amount)})`,
        )
        .join("; ") || ""
    );
  if (key === "company")
    return companies.find((c) => c.id === row.company)?.name || "";
  if (["id", "name", "amount"].includes(key)) return (row as any)[key];
  if (key === "status")
    return row.kind === "salesPending" ? "Pendente" : "Faturada";
  return row.fields?.[key] ?? "";
}
export default function CommercialReport({
  kind,
}: {
  kind: "contracts" | "sales";
}) {
  const params = useSearchParams();
  const [billingFilter, setBillingFilter] = useState(
    Object.hasOwn(billingLabels, params.get("billing") || "")
      ? params.get("billing")!
      : "all",
  );
  const [contractFilter, setContractFilter] = useState(params.get("filter") === "pending" ? "pending" : "total");
  const [quickUpdates, setQuickUpdates] = useState<Record<string, { busy?: boolean; value?: string; error?: string }>>({});
  const quickKey = (row: Detail, field: string) => `${row.fields?.sourceCompany || row.company}:${row.id}:${field}`;
  const [quickEdit, setQuickEdit] = useState<{ row: Detail; field: "expected" | "flowStatus" } | null>(null);
  const [billingRow, setBillingRow] = useState<Detail | null>(null);
  const current = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date())
    .slice(0, 7);
  const [period, setPeriod] = useState(
    /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.get("period") || "")
      ? params.get("period")!
      : current,
  );
  const [company, setCompany] = useState(
      ["1", "2", "27404"].includes(params.get("company") || "")
        ? params.get("company")!
        : "all",
    ),
    [status, setStatus] = useState(
      ["Pendente", "Processado"].includes(params.get("status") || "")
        ? params.get("status")!
        : "all",
    ),
    [query, setQuery] = useState(""),
    [data, setData] = useState<ProjectionData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [filters, setFilters] = useState<Record<string, string[] | undefined>>({}),
    [sort, setSort] = useState({ key: "name", dir: 1 });
  const cols = kind === "contracts" ? contractCols : salesCols;
  useEffect(() => {
    const ctrl = new AbortController();
    let running = false;
    setData(null);
    async function load(initial = false) {
      if (running || ctrl.signal.aborted) return;
      running = true;
      if (initial) setBusy(true);
      try {
        const r = await fetch("/api/sales-projection?period=" + period, {signal:ctrl.signal,cache:"no-store"});
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!ctrl.signal.aborted) {setData(d); setError("");}
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message);
      } finally {
        running = false;
        if (!ctrl.signal.aborted && initial) setBusy(false);
      }
    }
    void load(true);
    const timer = setInterval(() => {if (!document.hidden) void load();}, 60000);
    const visible = () => {if (!document.hidden) void load();};
    document.addEventListener("visibilitychange", visible);
    return () => {ctrl.abort();clearInterval(timer);document.removeEventListener("visibilitychange", visible);};
  }, [period, refresh]);
  const base = useMemo(
    () =>
      data?.details.filter((r) =>
        kind === "contracts"
          ? r.kind === "contracts"
          : r.kind.startsWith("sales"),
      ) || [],
    [data, kind],
  );
  const billingCardsMode = kind === "sales" && status === "Processado";
  const filterScope = useMemo(() => base.filter(r =>
    (company === "all" || String(r.company) === company) &&
    (kind === "contracts" || status === "all" || r.kind === (status === "Pendente" ? "salesPending" : "salesBilled")) &&
    (kind === "contracts" || billingFilter === "all" || (r.billing?.state || "unanalyzed") === billingFilter) &&
    fold(query).split(/\s+/).every(q => fold(cols.map(c=>String(reportValue(r,c.key))).join(" ")).includes(q)) &&
    (kind !== "contracts" || contractFilter === "total" ||
      (contractFilter === "pending" || contractFilter === "billed"
        ? Math.round(Number(r.fields?.[contractFilter] || 0)*100)>0
        : contractGroup(r) === contractFilter))
  ),[base,company,status,kind,billingFilter,query,cols,contractFilter]);
  const filterValues = (key:string) => tableFilterValues(filterScope,key,filters,(row,field)=>String(reportValue(row,field)));
  const ownerScope = useMemo(
    () =>
      base
        .filter(
          (r) =>
            (company === "all" || String(r.company) === company) &&
            (kind === "contracts" ||
              billingCardsMode ||
              billingFilter === "all" ||
              r.billing?.state === billingFilter) &&
            (kind === "contracts" ||
              status === "all" ||
              r.kind ===
                (status === "Pendente" ? "salesPending" : "salesBilled")) &&
            fold(query)
              .split(/\s+/)
              .every((q) =>
                fold(
                  cols.map((c) => String(reportValue(r, c.key))).join(" "),
                ).includes(q),
              ) &&
            cols.every(
              (c) =>
                c.key === (billingCardsMode ? "billingState" : "flowOwner") ||
                !filters[c.key] ||
                filters[c.key]!.includes(String(reportValue(r, c.key))),
            ),
        )
        .sort((a, b) => {
          const x = reportValue(a, sort.key),
            y = reportValue(b, sort.key);
          return (
            sort.dir *
            (typeof x === "number" && typeof y === "number"
              ? x - y
              : String(x).localeCompare(String(y), "pt-BR", { numeric: true }))
          );
        }),
    [base, company, status, query, filters, sort, kind, billingFilter, billingCardsMode],
  );
  const visible = useMemo(
    () =>
      ownerScope.filter(
        (r) =>
          kind === "contracts"
            ? contractFilter === "total" ||
              (contractFilter === "pending" || contractFilter === "billed"
                ? Math.round(Number(r.fields?.[contractFilter] || 0) * 100) > 0
                : contractGroup(r) === contractFilter)
            : billingCardsMode
            ? (billingFilter === "all" || (r.billing?.state || "unanalyzed") === billingFilter) &&
              (!filters.billingState || filters.billingState.includes(String(reportValue(r, "billingState"))))
            : !filters.flowOwner ||
              filters.flowOwner.includes(String(reportValue(r, "flowOwner"))),
      ),
    [ownerScope, filters.flowOwner, filters.billingState, billingCardsMode, billingFilter, kind, contractFilter],
  );
  const ownerCards = useMemo(() => {
    const groups = new Map<
      string,
      { owner: string; cents: number; count: number }
    >();
    for (const row of ownerScope) {
      const owner = billingCardsMode ? row.billing?.state || "unanalyzed" : String(reportValue(row, "flowOwner"));
      const group = groups.get(owner) || { owner, cents: 0, count: 0 };
      group.cents += Math.round(row.amount * 100);
      group.count++;
      groups.set(owner, group);
    }
    const stages = billingCardsMode
      ? ["matched", "partial", "review", "unmatched", ...(groups.has("unanalyzed") ? ["unanalyzed"] : [])]
      : flowStages;
    return [
      ...stages.map(
        (owner) => groups.get(owner) || { owner, cents: 0, count: 0 },
      ),
      ...[...groups.values()]
        .filter((group) => !stages.includes(group.owner))
        .sort((a, b) => a.owner.localeCompare(b.owner, "pt-BR")),
    ];
  }, [ownerScope, billingCardsMode]);
  const contractSummary = useMemo(() => {
    const summary = { total: 0, pending: 0, billed: 0, maintenance: 0, rental: 0, other: 0 };
    if (kind !== "contracts") return summary;
    for (const row of ownerScope) {
      const cents = Math.round(row.amount * 100);
      summary.total += cents;
      summary.pending += Math.round(Number(row.fields?.pending || 0) * 100);
      summary.billed += Math.round(Number(row.fields?.billed || 0) * 100);
      summary[contractGroup(row)] += cents;
    }
    return summary;
  }, [kind, ownerScope]);
  const title = kind === "contracts" ? "Contratos" : "Vendas";
  const back = `/comercial/projecao?period=${period}&company=${company}`;
  const returnTo = `/comercial/vendas?period=${period}&company=${company}&status=${status}&billing=${billingFilter}`;
  const isOverdue = (r: Detail) => quickUpdates[quickKey(r, "expected")]?.value
    ? String(quickUpdates[quickKey(r, "expected")].value).slice(0, 7) < (data?.today || "").slice(0, 7)
    : r.overdue;
  const display = (r: Detail, c: Col) => {
    const v = quickUpdates[quickKey(r, c.key)]?.value ?? reportValue(r, c.key);
    if (v === "") return "—";
    return c.type === "money"
      ? money(v)
      : c.type === "date" && v
        ? String(v).slice(0, 10).split("-").reverse().join("/")
        : String(v) || "—";
  };
  function csv() {
    const text = [
      cols.map((c) => c.label),
      ...visible.map((r) => cols.map((c) => display(r, c))),
    ]
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              (String(v).match(/^[=+@\-]/) ? "'" : "") +
              String(v).replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <SiteHeader
        active={
          kind === "contracts" ? "commercialContracts" : "commercialSales"
        }
      />
      {quickEdit && <OrderQuickEdit row={quickEdit.row} field={quickEdit.field}
        onClose={() => setQuickEdit(null)}
        onStart={() => {
          const key = quickKey(quickEdit.row, quickEdit.field);
          setQuickUpdates((all) => ({ ...all, [key]: { ...all[key], busy: true, error: undefined } }));
        }}
        onResult={(result) => {
          const key = quickKey(quickEdit.row, quickEdit.field);
          setQuickUpdates((all) => ({ ...all, [key]: { value: result.value ?? all[key]?.value, error: result.error, busy: false } }));
        }} />}
      <main className="sales-projection commercial-report">
        <Link className="cr-back" href={back}>
          <ArrowLeft size={16} /> Voltar à projeção
        </Link>
        <div className="sp-heading">
          <div>
            <span className="eyebrow">COMERCIAL / ACOMPANHAMENTO</span>
            <h1>{title}</h1>
            <p>
              {kind === "contracts"
                ? "Parcelas, vigência e faturamento dos contratos no período."
                : "Pendentes e faturadas em uma única visão. Ajuste a OS para atualizar a projeção."}
            </p>
          </div>
          <div className="sp-actions">
            <button className="button" onClick={csv} disabled={busy || !data}>
              <Download size={16} /> Exportar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => setRefresh((x) => x + 1)}
            >
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </div>
        {data && <CommercialUpdateStatus ordersUpdatedAt={data.ordersUpdatedAt} updatedAt={data.updatedAt} />}
        <CommercialPeriodFilter
          period={period}
          company={company}
          onPeriodChange={setPeriod}
          onCompanyChange={setCompany}
          companies={companies.map((c) => ({ company: c.id, name: c.name }))}
        />
        <details className="cr-filter-panel">
          <summary><SlidersHorizontal size={16} aria-hidden="true" /><span>Filtros de pesquisa</span><ChevronRight className="cr-filter-chevron" size={16} aria-hidden="true" /></summary>
          <section className="cr-filters">
          {kind === "sales" && (
            <label>
              Situação
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setFilters((f) => ({ ...f, flowOwner: undefined }));
                }}
              >
                <option value="all">Pendentes e faturadas</option>
                <option value="Pendente">Pendentes</option>
                <option value="Processado">Faturadas</option>
              </select>
            </label>
          )}
          {kind === "sales" && (
            <label>
              Conferência do faturamento
              <select
                value={billingFilter}
                onChange={(e) => setBillingFilter(e.target.value)}
              >
                <option value="all">Todas</option>
                {billingFilter === "unanalyzed" && <option value="unanalyzed">Sem análise</option>}
                {Object.entries(billingLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="cr-search">
            Pesquisar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cliente, OS, equipamento, observação…"
            />
          </label>
          {cols.filter((c) => !["company", "status", "billingState"].includes(c.key)).map((c) => (
            <label key={c.key}>
              {c.label}
              {c.key === "name" ? <OrderSearchSelect
                label={c.label}
                placeholder="Digite para pesquisar cliente ou equipamento"
                value={filters[c.key]?.length === 1 ? filters[c.key]![0] : "__all__"}
                selectedLabel={filters[c.key] && filters[c.key]!.length !== 1 ? "Seleção do filtro da coluna" : undefined}
                options={[
                  {id:"__all__",name:"Todos",displayId:""},
                  ...[...new Map(base.map(r => [String(reportValue(r,c.key)),display(r,c)])).entries()]
                    .sort((a,b)=>a[1].localeCompare(b[1],"pt-BR",{numeric:true}))
                    .map(([id,name])=>({id,name:name||"Não informado",displayId:""}))
                ]}
                onChange={row=>setFilters(f=>({...f,[c.key]:row.id==="__all__"?undefined:[row.id]}))}
              /> : <select
                value={filters[c.key]?.length === 1 ? filters[c.key]![0] : filters[c.key] ? "__multiple__" : "__all__"}
                onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value === "__all__" ? undefined : [e.target.value] }))}
              >
                <option value="__all__">Todos</option>
                {filters[c.key] && filters[c.key]!.length !== 1 && <option value="__multiple__">Seleção do filtro da coluna</option>}
                {[...new Map(base.map((r) => [String(reportValue(r, c.key)), display(r, c)])).entries()]
                  .sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true }))
                  .map(([value, label]) => <option key={value} value={value}>{label || "Não informado"}</option>)}
              </select>}
            </label>
          ))}
          <button
            className="button cr-filter-reset"
            onClick={() => {
              setFilters({});
              setContractFilter("total");
              setQuery("");
              setCompany("all");
              setStatus("all");
              setBillingFilter("all");
            }}
          >
            <X size={16} aria-hidden="true"/> Limpar filtros
          </button>
          </section>
        </details>
        {error && (
          <p role="alert" className="sp-notice">
            {error}
          </p>
        )}
        {busy && <p role="status">Carregando {title.toLowerCase()}…</p>}
        {data && !busy && (
          <>
            {kind === "contracts" && (
              <section className="cr-owner-section" aria-label="Resumo dos contratos">
                <div className="cr-owner-heading">
                  <h2>Contratos · valores da competência</h2>
                  <p>Os valores acompanham os filtros. Manutenção reúne os tipos 1 e 6, incluindo retenção de CSRF.</p>
                </div>
                <div className="cr-contract-cards">
                  {[
                    { label: "Total de contratos", value: contractSummary.total, tone: "total" },
                    { label: "Valores pendentes", value: contractSummary.pending, tone: "pending" },
                    { label: "Valores faturados", value: contractSummary.billed, tone: "billed" },
                    { label: "Contratos de Manutenção", value: contractSummary.maintenance, tone: "maintenance" },
                    { label: "Contratos de Locação", value: contractSummary.rental, tone: "rental" },
                    ...(contractSummary.other ? [{ label: "Outros contratos", value: contractSummary.other, tone: "other" }] : []),
                  ].map((card) => (
                    <button type="button" key={card.tone} className="cr-owner-card cr-contract-card" data-tone={card.tone}
                      aria-pressed={contractFilter === card.tone}
                      onClick={() => setContractFilter((current) => current === card.tone ? "total" : card.tone)}
                    >
                      <span>{card.label}</span>
                      <strong>R$ {money(card.value / 100)}</strong>
                      <small>{card.tone === "total" ? `${ownerScope.length} contratos · parcelas do período` : contractFilter === card.tone ? "Filtro ativo" : "Filtrar lista"}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {kind === "sales" && (
              <section
                className="cr-owner-section"
                aria-label={billingCardsMode ? "Valores por conferência do faturamento" : "Valores por responsável do fluxo"}
              >
                <div className="cr-owner-heading">
                  <h2>{billingCardsMode ? "Conferência do faturamento" : "Responsável do fluxo"} · valor das OS</h2>
                  <p>
                    Clique para filtrar a lista. Os valores acompanham os demais
                    filtros.
                  </p>
                </div>
                <div className="cr-owner-cards">
                  <button
                    type="button"
                    className="cr-owner-card cr-owner-total"
                    aria-pressed={billingCardsMode ? billingFilter === "all" && !filters.billingState : !filters.flowOwner}
                    onClick={() => {
                      if (billingCardsMode) {
                        setBillingFilter("all");
                        setFilters((f) => ({ ...f, billingState: undefined }));
                      } else setFilters((f) => ({ ...f, flowOwner: undefined }));
                    }}
                  >
                    <span>{billingCardsMode ? "Todas as conferências" : "Todos os responsáveis"}</span>
                    <strong>
                      R${" "}
                      {money(
                        ownerCards.reduce((sum, c) => sum + c.cents, 0) / 100,
                      )}
                    </strong>
                    <small>{ownerScope.length} OS</small>
                  </button>
                  {ownerCards.map((card) => (
                    <button
                      type="button"
                      key={card.owner}
                      className="cr-owner-card"
                      data-billing-state={billingCardsMode ? card.owner : undefined}
                      aria-pressed={
                        billingCardsMode ? billingFilter === card.owner : filters.flowOwner?.includes(card.owner) || false
                      }
                      onClick={() => {
                        if (billingCardsMode) {
                          setBillingFilter((value) => value === card.owner ? "all" : card.owner);
                          setFilters((f) => ({ ...f, billingState: undefined }));
                          return;
                        }
                        setFilters((f) => ({
                          ...f,
                          flowOwner:
                            f.flowOwner?.length === 1 &&
                            f.flowOwner[0] === card.owner
                              ? undefined
                              : [card.owner],
                        }));
                      }}
                    >
                      {!billingCardsMode && flowStages.indexOf(card.owner) > 0 && (
                        <span className="cr-stage-arrow" aria-hidden="true">
                          ›
                        </span>
                      )}
                      <span className="cr-owner-stage">
                        {billingCardsMode ? billingLabels[card.owner as keyof typeof billingLabels] || "Sem análise" : card.owner || "Sem responsável"}
                      </span>
                      <strong>R$ {money(card.cents / 100)}</strong>
                      <small>
                        {card.count} OS ·{" "}
                        {(billingCardsMode ? billingFilter === card.owner : filters.flowOwner?.includes(card.owner))
                          ? "Filtro ativo"
                          : "Filtrar lista"}
                      </small>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!data.complete && (
              <p className="sp-notice">
                Integração comercial ainda incompleta.
              </p>
            )}
            {params.get("sync") === "pending" && (
              <p className="sp-notice">
                A OS foi salva no ERP, mas a atualização local não foi
                confirmada. Aguarde a próxima sincronização antes de conferir a
                projeção.
              </p>
            )}
            {kind === "sales" && visible.some((r) => r.billing?.state === "partial") && (
              <div className="cr-billing-notice">
                <strong>
                  {visible.filter((r) => r.billing?.state === "partial").length}{" "}
                  possíveis faturamentos parciais · R${" "}
                  {money(
                    visible.reduce(
                      (sum, r) =>
                        sum +
                        (r.billing?.state === "partial"
                          ? r.billing.balance || 0
                          : 0),
                      0,
                    ),
                  )}{" "}
                  a conferir
                </strong>
                <p>
                  Confronto do total da OS com as notas válidas identificadas,
                  incluindo complementos de outros meses. Esse saldo não é
                  somado automaticamente à projeção. Clique na conferência de
                  uma OS para ver as notas.
                </p>
              </div>
            )}
            <div className="cr-summary">
              <strong>{visible.length} registros</strong>
              <span>
                {kind === "contracts" ? "Parcelas previstas" : "Valor das OS"}{" "}
                <b>R$ {money(visible.reduce((s, r) => s + r.amount, 0))}</b>
              </span>
              {kind === "sales" && (
                <>
                  <span>
                    Pendente{" "}
                    <b>
                      R${" "}
                      {money(
                        visible
                          .filter((r) => r.kind === "salesPending")
                          .reduce((s, r) => s + r.amount, 0),
                      )}
                    </b>
                  </span>
                  <span>
                    Faturado{" "}
                    <b>
                      R${" "}
                      {money(
                        visible
                          .filter((r) => r.kind === "salesBilled")
                          .reduce((s, r) => s + r.amount, 0),
                      )}
                    </b>
                  </span>
                </>
              )}
            </div>
            <div className="cr-table-scroll">
              <table className="cr-table" data-report={kind}>
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} data-column={c.key} data-filtered={filters[c.key] ? "true" : undefined}>
                        <div className="cr-column">
                          <span>{c.label}</span>
                          <ColumnFilter
                            arrowOnly
                            label={c.label}
                            values={filterValues(c.key)}
                            selected={filters[c.key]}
                            onOpen={() => {}}
                            onSort={(dir) => setSort({ key: c.key, dir })}
                            onApply={(values) =>
                              setFilters((f) => ({ ...f, [c.key]: values }))
                            }
                          />
                        </div>
                      </th>
                    ))}
                    {kind === "sales" && <th className="cr-edit">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={`${r.company}-${r.id}`}>
                      {cols.map((c) => (
                        <td
                          key={c.key}
                          data-column={c.key}
                          className={c.type === "money" ? "cr-number" : ""}
                        >
                          {kind === "contracts" && ["pending", "billed", "installment"].includes(c.key) ? (
                            <ContractSignal row={r} column={c.key} value={String(display(r, c))} />
                          ) : c.key === "billingState" ? (
                            <button
                              className={`cr-billing-state ${r.billing?.state || ""}`}
                              onClick={() => setBillingRow(r)}
                              aria-label={`Conferir faturamento da OS ${r.id}`}
                            >
                              {display(r, c)} ↗
                            </button>
                          ) : c.key === "billingDocuments" ? (
                            <button
                              className="sp-text-button"
                              onClick={() => setBillingRow(r)}
                            >
                              {r.billing?.documents.length || 0} nota(s) · Ver
                            </button>
                          ) : c.key === "notes" && reportValue(r, c.key) ? (
                            <details>
                              <summary>Ver observação</summary>
                              <p>{String(reportValue(r, c.key))}</p>
                            </details>
                          ) : c.key === "name" && kind === "sales" ? (
                            <div>{r.name}<small className="cr-client-equipment">{r.fields?.equipment || "Equipamento não informado"}</small></div>
                          ) : c.key === "id" ? (
                            <span className="cr-code">
                              {kind === "sales" ? (
                                <OrderDetailLink id={r.id} company={r.fields?.sourceCompany || r.company} number={display(r,c)}>
                                  OS-{display(r,c)}
                                </OrderDetailLink>
                              ) : display(r,c)}
                            </span>
                          ) : c.key === "company" ? (
                            <span className="cr-company">{display(r, c)}</span>
                          ) : c.key === "status" ? (
                            <div className="cr-order-programming">
                            <span
                              className={`cr-status ${r.kind === "salesPending" ? "pending" : "processed"}`}
                            >
                              {display(r, c)}
                            </span>
                            <HistoryProgrammingAction
                              company={r.fields?.sourceCompany || r.company}
                              orderId={r.id}
                              orderStatus={String(r.fields?.status || "")}
                              scheduleId={r.programming?.id}
                              status={r.programming?.status}
                              label={r.programming?.label}
                            />
                            </div>
                          ) : c.key === "expected" ? (
                            <span className={isOverdue(r) ? "sp-red" : undefined}>{display(r, c)}</span>
                          ) : (
                            display(r, c)
                          )}
                          {kind === "sales" && r.kind === "salesPending" && (c.key === "expected" || c.key === "flowStatus") && (
                            <button type="button" className="cr-quick-pencil"
                              disabled={["expected", "flowStatus"].some((field) => quickUpdates[quickKey(r, field)]?.busy)}
                              aria-label={`Editar ${c.label} da OS ${r.id}`}
                              title={`Editar ${c.label}`}
                              onClick={() => setQuickEdit({ row: r, field: c.key as "expected" | "flowStatus" })}>
                              <Pencil size={13} />
                            </button>
                          )}
                          {kind === "sales" && r.linkedOrder && ["id", "orderType", "flowStatus"].includes(c.key) && (
                            <small className={`cr-linked-order-comment${c.key === "id" ? " cr-linked-order-number" : ""}`} title={`OS vinculada · ${r.linkedOrder.number}`}>
                              <Link2 size={12} aria-hidden="true"/>
                              {c.key === "id" ? <OrderDetailLink id={r.linkedOrder.id} company={r.linkedOrder.company} number={r.linkedOrder.number}>OS-{r.linkedOrder.number}</OrderDetailLink>
                                : <span>{c.key === "orderType" ? r.linkedOrder.orderType || "Tipo não informado" : r.linkedOrder.flowStatus || "Status do fluxo não informado"}</span>}
                            </small>
                          )}
                          {quickUpdates[quickKey(r, c.key)]?.busy && <small role="status">Salvando no ERP…</small>}
                          {quickUpdates[quickKey(r, c.key)]?.error && <small role="alert" className="cr-quick-error">{quickUpdates[quickKey(r, c.key)].error}</small>}
                          {c.key === "expected" && isOverdue(r) && (
                            <small className="sp-red">
                              Vencida · projetada para o mês atual
                            </small>
                          )}
                        </td>
                      ))}
                      {kind === "sales" && (
                        <td className="cr-edit">
                          {r.kind === "salesPending" ? (
                            <Link
                              className="button"
                              aria-label={`Editar OS ${r.id}`}
                              title={`Editar OS ${r.id}`}
                              href={`/OrdemServico/editar?empresa=${r.fields?.sourceCompany || r.company}&id=${r.id}&returnTo=${encodeURIComponent(returnTo)}`}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </Link>
                          ) : (
                            <span className="cr-readonly">Somente leitura</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && (
                <p className="sp-empty">
                  Nenhum registro para os filtros selecionados.
                </p>
              )}
            </div>
            {kind === "contracts" && (
              <p className="sp-footnote">
                Faturamento vinculado por cliente, valor da parcela e
                competência, conforme o PBIX. Não representa confirmação de
                recebimento financeiro. Contratos com a mesma chave podem
                compartilhar o mesmo faturamento vinculado.
              </p>
            )}
          </>
        )}
      </main>
      <OrderBillingDialog
        row={billingRow}
        onClose={() => setBillingRow(null)}
      />
    </>
  );
}
