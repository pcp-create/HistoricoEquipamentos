"use client";
import { companyName } from "@/lib/company-names";
import { isNotApproved } from "@/lib/material-approval";
import { PriceValues, StockValues, SoldValues } from "./product-values";
import type { ProductCurrent } from "@/lib/product-values";
import OrderProfitPanel from "./order-profit-panel";
import { orderTotals } from "@/lib/order-totals";
import SiteHeader from "./site-header";
import ProductPhotos from "./product-photos";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Database,
  Eye,
  Filter,
  LoaderCircle,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wrench,
  X,
} from "lucide-react";

type Row = {
  current?: ProductCurrent;
  company_id: number;
  id: string;
  number: string;
  date: string | null;
  client: string | null;
  document: string | null;
  equipment: string | null;
  equipment_origin?: string | null;
  model: string | null;
  serial: string | null;
  status: string | null;
  situation: string | null;
  detail_at: string | null;
  materials?: number;
  excluded_materials?: number;
  rejected_materials?: number;
  is_excluded?: boolean;
  approval?: string | boolean | null;
  amount: string | null;
  material?: string;
  reference?: string;
  quantity?: string;
  unit?: string;
  item_id?: string;
  product_id?: string;
};
type Results = { rows: Row[]; total: number; page: number; size: number };
type Overview = {
  orders: number;
  materials: number;
  clients: number;
  imported: number;
  updated: string | null;
  statuses: string[];
  email: string;
};
type Detail = {
  order: Record<string, unknown>;
  materials: Record<string, unknown>[];
  services?: Record<string, unknown>[];
  equipment: Record<string, unknown>[];
  equipment_links?: {
    equipment_id: string;
    name: string;
    model: string | null;
    serial: string | null;
    serial_source: string | null;
    method: string;
    evidence: { field: string; value: string; reason: string };
  }[];
  detail_at: string | null;
};
const initial = {
  q: "",
  company: "",
  orderNumber: "",
  status: "",
  client: "",
  equipment: "",
  model: "",
  serial: "",
  exactSerial: "",
  product: "",
  productId: "",
  from: "",
  to: "",
};
type Inputs = typeof initial;
const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const date = (value: unknown, withTime = false) => {
  if (!value) return "—";
  const d = new Date(String(value));
  return isNaN(d.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(d);
};
const money = (value: unknown) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(value));
const shown = (value: unknown) =>
  value == null || value === ""
    ? "—"
    : typeof value === "boolean"
      ? value
        ? "Sim"
        : "Não"
      : String(value);
function Badge({ status }: { status: string | null }) {
  return (
    <span
      className={`badge ${status === "Processado" ? "green" : status === "Cancelado" ? "gray" : status === "Aprovado" ? "blue" : "amber"}`}
    >
      <i />
      {status || "Não informado"}
    </span>
  );
}
function searchParams(
  filters: Inputs,
  view: string,
  page: number,
  size: number,
) {
  const p = new URLSearchParams({
    view,
    page: String(page),
    size: String(size),
  });
  Object.entries(filters).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  return p;
}

  async function api(url: string, signal?: AbortSignal) {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/login");
      throw new Error("Sessão expirada.");
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Não foi possível carregar os dados.");
    return data;
  }

export default function Dashboard() {
  const [draft, setDraft] = useState(initial),
    [filters, setFilters] = useState(initial),
    [view, setView] = useState<"orders" | "materials">("orders"),
    [page, setPage] = useState(1),
    [size, setSize] = useState(25);
  const [result, setResult] = useState<Results | null>(null),
    [overview, setOverview] = useState<Overview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [refresh, setRefresh] = useState(0),
    [expanded, setExpanded] = useState(true),
    [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<Row | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const input = { ...initial };
    for (const key of Object.keys(input) as (keyof Inputs)[])
      input[key] = params.get(key) || "";
    setDraft(input);
    setFilters(input);
    setView(params.get("view") === "materials" ? "materials" : "orders");
    const p = Number(params.get("page"));
    if (Number.isSafeInteger(p) && p > 0) setPage(p);
    const s = Number(params.get("size"));
    if ([25, 50, 100].includes(s)) setSize(s);
    setReady(true);
  }, []);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!ready || draft.q === filters.q) return;
    const timer = setTimeout(() => {
      setPage(1);
      setFilters((current) => ({ ...current, q: draft.q }));
    }, 500);
    return () => clearTimeout(timer);
  }, [ready, draft.q, filters.q]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    api("/api/history?overview=1", controller.signal)
      .then(setOverview)
      .catch(() => {});
    return () => controller.abort();
  }, [ready, refresh]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = searchParams(filters, view, page, size);
    const navigationParams = new URLSearchParams(params);
    const module = new URLSearchParams(window.location.search).get("module");
    if (module) navigationParams.set("module", module);
    window.history.replaceState(null, "", `/historico?${navigationParams}`);
    api(`/api/history?${params}`, controller.signal)
      .then((data) => {
        setResult(data);
        if (data.page !== page) setPage(data.page);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ready, filters, view, page, size, refresh]);
  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  }
  function clear() {
    setDraft(initial);
    setFilters(initial);
    setPage(1);
  }
  function changeView(value: "orders" | "materials") {
    setView(value);
    setPage(1);
    setResult(null);
  }
  function field(key: keyof Inputs, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const params = searchParams(filters, view, 1, size);
      params.set("export", "csv");
      const response = await fetch(`/api/history?${params}`);
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `historico-${view === "orders" ? "ordens" : "materiais"}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na exportação.");
    } finally {
      setExporting(false);
    }
  }
  const filterCount = Object.values(filters).filter(Boolean).length;
  const totalPages = Math.max(1, Math.ceil((result?.total || 0) / size));
  const shownPage = result?.page || page;
  const pages = [
    ...new Set([1, shownPage - 1, shownPage, shownPage + 1, totalPages]),
  ]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  return (
    <>
      <SiteHeader active="history" email={overview?.email} />
      <main className="main">
        <div className="page-heading">
          <div>
            <div className="eyebrow">MANUTENÇÃO / CONSULTAS</div>
            <h1>
              O histórico completo, em um só lugar<span>.</span>
            </h1>
            <p>
              Encontre ordens de serviço e acompanhe os materiais aplicados nos
              seus equipamentos.
            </p>
          </div>
          <button
            className="button refresh-button"
            onClick={() => setRefresh((r) => r + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Atualizar dados
          </button>
        </div>
        <form onSubmit={submit} className="search-section">
          <div className="global-search">
            <Search size={23} />
            <input
              ref={searchInput}
              aria-label="Pesquisa global"
              placeholder="Pesquise por cliente, equipamento, nº de série, material, referência..."
              value={draft.q}
              onChange={(e) => field("q", e.target.value)}
              maxLength={200}
            />
            <kbd>Ctrl K</kbd>
            <button className="primary" type="submit">
              <Search size={16} />
              Pesquisar
            </button>
          </div>
          <div className="search-hint">
            <span>
              <CircleHelp size={13} />
              Uma pesquisa em todas as colunas de OS, materiais e equipamentos,
              inclusive nos detalhes.
            </span>
            <span>Combine palavras para refinar sua busca</span>
          </div>
          <section className="filter-panel">
            <button
              type="button"
              className="filter-toggle"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              <span>
                <SlidersHorizontal size={17} />
                Filtros de pesquisa
                {filterCount > 0 && <b className="count-pill">{filterCount}</b>}
              </span>
              <ChevronDown className={!expanded ? "collapsed" : ""} size={17} />
            </button>
            {expanded && (
              <div className="filter-content">
                <div className="filter-grid">
                  <label>
                    N° da OS
                    <input
                      placeholder="Ex.: 14681"
                      value={draft.orderNumber}
                      onChange={(e) => field("orderNumber", e.target.value)}
                    />
                  </label>
                  <label>
                    Empresa
                    <select
                      value={draft.company}
                      onChange={(e) => field("company", e.target.value)}
                    >
                      <option value="">Todas as empresas</option>
                      {["1", "2", "27404"].map((c) => (
                        <option key={c} value={c}>
                          {companyName(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cliente
                    <input
                      placeholder="Nome ou CPF/CNPJ"
                      value={draft.client}
                      onChange={(e) => field("client", e.target.value)}
                    />
                  </label>
                  <label>
                    Equipamento
                    <input
                      placeholder="Nome ou código"
                      value={draft.equipment}
                      onChange={(e) => field("equipment", e.target.value)}
                    />
                  </label>
                  <label>
                    Modelo
                    <input
                      placeholder="Todos os modelos"
                      value={draft.model}
                      onChange={(e) => field("model", e.target.value)}
                    />
                  </label>
                  <label>
                    Número de série
                    <input
                      placeholder="Digite o nº de série"
                      value={draft.serial}
                      onChange={(e) => field("serial", e.target.value)}
                    />
                  </label>
                  <label>
                    Material / produto
                    <input
                      placeholder="Descrição, código ou referência"
                      value={draft.product}
                      onChange={(e) => field("product", e.target.value)}
                    />
                  </label>
                  <label>
                    Status da OS
                    <select
                      value={draft.status}
                      onChange={(e) => field("status", e.target.value)}
                    >
                      <option value="">Todos os status</option>
                      {(
                        overview?.statuses || [
                          "Processado",
                          "Pendente",
                          "Cancelado",
                          "Aprovado",
                        ]
                      ).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Data inicial
                    <input
                      type="date"
                      value={draft.from}
                      max={draft.to || undefined}
                      onChange={(e) => field("from", e.target.value)}
                    />
                  </label>
                  <label>
                    Data final
                    <input
                      type="date"
                      value={draft.to}
                      min={draft.from || undefined}
                      onChange={(e) => field("to", e.target.value)}
                    />
                  </label>
                  <div className="filter-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={clear}
                    >
                      <X size={15} />
                      Limpar
                    </button>
                    <button type="submit" className="button">
                      <Filter size={15} />
                      Aplicar filtros
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </form>
        <section className="stats" aria-label="Resumo da base">
          <Stat
            label="Ordens de serviço"
            value={overview?.orders}
            icon={<ClipboardList size={21} />}
            note="Registradas na base"
          />
          <Stat
            label="Materiais aplicados"
            value={overview?.materials}
            icon={<Package size={21} />}
            note="Itens ativos importados"
          />
          <Stat
            label="Clientes atendidos"
            value={overview?.clients}
            icon={<Users size={21} />}
            note="Clientes distintos"
          />
          <Stat
            label="OS com detalhes importados"
            value={overview?.imported}
            icon={<ShieldCheck size={21} />}
            note={
              overview
                ? `de ${number(overview.orders)} ordens de serviço`
                : "Acompanhando a importação"
            }
          />
        </section>
        <section className="results-panel">
          <div className="results-heading">
            <div className="results-title">
              <span className="section-icon">
                <ClipboardList size={22} />
              </span>
              <div>
                <h2>Ordens de Serviço e Materiais Aplicados</h2>
                <p>Explore o histórico de manutenção dos equipamentos.</p>
              </div>
            </div>
            <button
              className="button export"
              disabled={loading || exporting || !result?.total}
              onClick={exportCsv}
            >
              {exporting ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowDownToLine size={16} />
              )}
              Exportar CSV
            </button>
          </div>
          <div className="results-toolbar">
            <div className="view-tabs" aria-label="Tipo de visão">
              <button
                className={view === "orders" ? "selected" : ""}
                onClick={() => changeView("orders")}
              >
                <ClipboardList size={16} />
                Por ordem de serviço
              </button>
              <button
                className={view === "materials" ? "selected" : ""}
                onClick={() => changeView("materials")}
              >
                <Box size={16} />
                Por material
              </button>
            </div>
            <span className="result-count">
              {loading ? (
                <>
                  <LoaderCircle className="spin" size={14} />
                  Buscando...
                </>
              ) : (
                <>
                  <strong>{number(result?.total || 0)}</strong>{" "}
                  {filterCount ? "resultados encontrados" : "registros"}
                </>
              )}
            </span>
          </div>
          {filterCount > 0 && (
            <div className="active-filters">
              <span>Filtros ativos:</span>
              {Object.entries(filters)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => {
                      const next = { ...filters, [k]: "" };
                      setFilters(next);
                      setDraft(next);
                      setPage(1);
                    }}
                  >
                    {
                      (
                        {
                          q: "Busca",
                          company: "Empresa",
                          orderNumber: "N° da OS",
                          status: "Status",
                          client: "Cliente",
                          equipment: "Equipamento",
                          model: "Modelo",
                          serial: "Série",
                          exactSerial: "Série exata",
                          product: "Material",
                          productId: "Código exato",
                          from: "De",
                          to: "Até",
                        } as Record<string, string>
                      )[k]
                    }
                    : {k === "company" ? companyName(v) : v}
                    <X size={12} />
                  </button>
                ))}
            </div>
          )}
          {error && (
            <div className="error results-error" role="alert">
              {error}
              <button onClick={() => setRefresh((r) => r + 1)}>
                Tentar novamente
              </button>
            </div>
          )}
          <div className="table-scroll" aria-busy={loading}>
            <table>
              <thead>
                <tr>
                  <th>Nº OS</th>
                  <th aria-sort="descending">
                    Data OS <ArrowDown size={12} />
                  </th>
                  <th>Cliente</th>
                  <th>Equipamento / modelo</th>
                  <th>Nº de série</th>
                  {view === "materials" ? (
                    <>
                      <th>Material aplicado</th>
                      <th className="numeric">Qtd.</th>
                      <th>Venda na OS / unidade</th>
                      <th>Preços atuais</th>
                      <th>Estoque atual da empresa</th>
                    </>
                  ) : (
                    <th className="numeric">Materiais</th>
                  )}
                  <th>Status</th>
                  <th>Empresa</th>
                  <th>
                    <span className="sr-only">Detalhes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i} className="skeleton-row">
                        {Array.from(
                          { length: view === "materials" ? 13 : 9 },
                          (_, j) => (
                            <td key={j}>
                              <span className="skeleton" />
                            </td>
                          ),
                        )}
                      </tr>
                    ))
                  : !error &&
                    result?.rows.map((row) => (
                      <tr
                        key={`${row.company_id}-${row.id}-${row.item_id || ""}`}
                      >
                        <td>
                          <button
                            className="order-link"
                            onClick={() => setSelection(row)}
                          >
                            OS-{row.number.padStart(5, "0")}
                          </button>
                          <small className="cell-secondary">
                            {row.situation || "Situação não informada"}
                          </small>
                        </td>
                        <td className="nowrap">{date(row.date)}</td>
                        <td>
                          <span className="cell-title" title={row.client || ""}>
                            {row.client || "Não informado"}
                          </span>
                          <small className="cell-secondary">
                            {row.document || "—"}
                          </small>
                        </td>
                        <td>
                          <span
                            className="cell-title"
                            title={row.equipment || ""}
                          >
                            {row.equipment || "Não informado"}
                          </span>
                          {row.equipment_origin && (
                            <small className="equipment-origin">
                              {row.equipment_origin.includes("observation")
                                ? "Série nas observações"
                                : "Cadastro de equipamentos"}
                            </small>
                          )}
                          <small
                            className="cell-secondary"
                            title={row.model || ""}
                          >
                            {row.model || "Modelo não informado"}
                          </small>
                        </td>
                        <td>
                          <span className="serial" title={row.serial || ""}>
                            {row.serial || "—"}
                          </span>
                        </td>
                        {view === "materials" ? (
                          <>
                            <td className="material-cell">
                              <span
                                className={`cell-title${row.is_excluded ? " excluded-description" : isNotApproved(row.approval) ? " unapproved-description" : ""}`}
                                title={row.material}
                              >
                                {row.material || "—"}
                              </span>
                              {isNotApproved(row.approval) &&
                                !row.is_excluded && (
                                  <small className="unapproved-description">
                                    Reprovado na OS
                                  </small>
                                )}
                              {row.is_excluded && (
                                <small className="excluded-label">
                                  Excluído da OS
                                </small>
                              )}
                              <small className="cell-secondary">
                                Código: {row.product_id || "Não informado"}
                              </small>
                              <small className="cell-secondary material-reference">
                                Ref. fabricante:{" "}
                                {row.reference || "Não informada"}
                              </small>
                              <ProductPhotos
                                company={row.company_id}
                                id={row.product_id}
                                name={row.material}
                              />
                            </td>
                            <td className="numeric">
                              {row.quantity == null
                                ? "—"
                                : new Intl.NumberFormat("pt-BR", {
                                    maximumFractionDigits: 4,
                                  }).format(Number(row.quantity))}
                              <small className="cell-secondary">
                                {row.unit}
                              </small>
                            </td>
                            <td>
                              <SoldValues
                                amount={row.amount}
                                quantity={row.quantity}
                                unit={row.unit}
                                current={row.current}
                                excluded={
                                  row.is_excluded || isNotApproved(row.approval)
                                }
                              />
                            </td>
                            <td>
                              <PriceValues current={row.current} />
                            </td>
                            <td>
                              <StockValues current={row.current} />
                            </td>
                          </>
                        ) : (
                          <td className="numeric">
                            {row.detail_at ? (
                              <span className="material-count">
                                <Package size={13} />
                                {row.materials}
                              </span>
                            ) : (
                              <span
                                className="pending-detail"
                                title="Os detalhes desta OS ainda estão sendo importados"
                              >
                                A importar
                              </span>
                            )}
                            {!!row.excluded_materials && (
                              <small className="excluded-label">
                                {row.excluded_materials} excluído(s)
                              </small>
                            )}
                            {!!row.rejected_materials && (
                              <small className="cell-secondary unapproved-description">
                                {row.rejected_materials} reprovado(s)
                              </small>
                            )}
                          </td>
                        )}
                        <td>
                          <Badge status={row.status} />
                        </td>
                        <td>
                          <span className="company-tag">
                            {companyName(row.company_id)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="detail-button"
                            aria-label={`Ver detalhes da OS ${row.number}`}
                            onClick={() => setSelection(row)}
                          >
                            <Eye size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && !error && result?.total === 0 && (
              <div className="empty">
                <Search size={35} />
                <h3>Nenhum registro encontrado</h3>
                <p>Tente outra palavra ou ajuste os filtros da pesquisa.</p>
                <button className="button" onClick={clear}>
                  Limpar filtros
                </button>
              </div>
            )}
          </div>
          <div className="pagination">
            <span>
              {result?.total ? (
                <>
                  Mostrando{" "}
                  <b>
                    {number((shownPage - 1) * size + 1)}–
                    {number(Math.min(shownPage * size, result.total))}
                  </b>{" "}
                  de <b>{number(result.total)}</b> registros
                </>
              ) : (
                "Nenhum registro para exibir"
              )}
            </span>
            <div className="pagination-right">
              <label>
                Por página
                <select
                  aria-label="Registros por página"
                  value={size}
                  onChange={(e) => {
                    setSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="page-buttons">
                <button
                  disabled={loading || shownPage === 1}
                  aria-label="Página anterior"
                  onClick={() => setPage(shownPage - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                {pages.map((p, i) => (
                  <span key={p}>
                    {i > 0 && p > pages[i - 1] + 1 && (
                      <span className="ellipsis">…</span>
                    )}
                    <button
                      disabled={loading}
                      className={p === shownPage ? "current" : ""}
                      aria-label={`Página ${p}`}
                      aria-current={p === shownPage ? "page" : undefined}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  </span>
                ))}
                <button
                  disabled={loading || shownPage >= totalPages}
                  aria-label="Próxima página"
                  onClick={() => setPage(shownPage + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>
        <div className="data-note">
          <Database size={15} />
          <span>
            {overview && overview.imported < overview.orders
              ? "A base está sendo preenchida. Algumas OS ainda aguardam a importação dos materiais."
              : "Os dados refletem a última coleta do integrador."}{" "}
            Preços e saldos são atuais, somados por empresa entre
            estabelecimentos; não representam o saldo ou preço na data da OS.
            Materiais excluídos da OS aparecem em vermelho e não entram na
            análise de consumo.
          </span>
        </div>
        <footer>
          <span>
            <Wrench size={14} />
            Histórico de Equipamentos e Peças
          </span>
          <span>
            <Clock3 size={14} />
            {overview?.updated
              ? `Última gravação de detalhes: ${date(overview.updated, true)} (Brasília)`
              : "Aguardando informação da última coleta"}
          </span>
        </footer>
      </main>
      {selection && (
        <OrderDetails
          selection={selection}
          onClose={() => setSelection(null)}
        />
      )}
    </>
  );
}
function Stat({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value?: number;
  icon: React.ReactNode;
  note: string;
}) {
  return (
    <article className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>
        {value === undefined ? <span className="skeleton" /> : number(value)}
      </strong>
      <small>{note}</small>
    </article>
  );
}
function FieldList({ fields }: { fields: Record<string, unknown> }) {
  return (
    <dl className="field-list">
      {Object.entries(fields)
        .filter(([key]) => key !== "current")
        .map(([key, value]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>
              {/^(data_|emissao|sincronizado_em|created_at|updated_at)/.test(
                key,
              )
                ? date(value, true)
                : shown(value)}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function OrderAmounts({ detail }: { detail: Detail }) {
  const totals = orderTotals(
    detail.materials,
    detail.services || [],
    detail.order.total_geral,
    !!detail.detail_at && Array.isArray(detail.services),
  );
  return (
    <section className="order-amounts" aria-label="Resumo dos valores da OS">
      <h4>Resumo dos valores</h4>
      <dl>
        <div>
          <dt>Materiais Aplicados</dt>
          <dd>{money(totals.materials)}</dd>
        </div>
        <div>
          <dt>Serviços Aplicados</dt>
          <dd>{money(totals.services)}</dd>
        </div>
        <div>
          <dt>Valor Total da OS</dt>
          <dd>{money(detail.order.total_geral)}</dd>
        </div>
        {totals.difference !== null && totals.difference !== 0 && (
          <div className="amount-difference">
            <dt>Diferença a conferir (ERP − itens)</dt>
            <dd>{money(totals.difference)}</dd>
          </div>
        )}
      </dl>
      <OrderProfitPanel
        company={String(detail.order.company_id)}
        id={String(detail.order.id_m8)}
        materials={detail.materials}
        services={detail.services || []}
        complete={!!detail.detail_at && Array.isArray(detail.services)}
      />
      {totals.combined === null ? (
        <p>
          Valores incompletos ou coleta pendente; não é possível conferir a
          soma.
        </p>
      ) : totals.difference !== null && totals.difference !== 0 ? (
        <p>
          O total informado pelo ERP difere dos itens importados. Confira os
          valores e eventuais ajustes na OS.
        </p>
      ) : null}
      {detail.materials.some((p) => isNotApproved(p.aprovado)) && (
        <p>
          Itens reprovados permanecem no histórico, mas não entram nos totais
          nem no custo estimado.
        </p>
      )}
      {detail.materials.some((p) => p.esta_excluido === true) && (
        <p>
          Materiais excluídos permanecem no histórico, mas não entram na soma.
        </p>
      )}
    </section>
  );
}

export function OrderDetails({
  selection,
  onClose,
}: {
  selection: { company_id: number; id: string; number: string };
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailError("");
    dialogRef.current?.showModal();
    api(
      `/api/orders/${selection.company_id}/${selection.id}`,
      controller.signal,
    )
      .then(setDetail)
      .catch((e) => {
        if (e.name !== "AbortError") setDetailError(e.message);
      });
    return () => controller.abort();
  }, [selection]);
  function closeDetail() {
    dialogRef.current?.close();
    onClose();
  }
  return (
    <dialog
      ref={dialogRef}
      className="detail-dialog"
      onCancel={closeDetail}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDetail();
      }}
    >
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <span className="eyebrow">
              ORDEM DE SERVIÇO · {companyName(selection?.company_id)}
            </span>
            <h2>OS-{selection?.number.padStart(5, "0")}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Fechar detalhes"
            onClick={closeDetail}
          >
            <X />
          </button>
        </div>
        {detailError ? (
          <div role="alert" className="error">
            {detailError}
          </div>
        ) : !detail ? (
          <div className="empty">
            <LoaderCircle className="spin" />
            Carregando detalhes...
          </div>
        ) : (
          <div className="drawer-body">
            <div className="detail-summary">
              <Badge status={String(detail.order.status || "")} />
              <span>
                {date(detail.order.emissao || detail.order.data_abertura)}
              </span>
              <strong>{money(detail.order.total_geral)}</strong>
            </div>
            <h3>{shown(detail.order.cliente_nome)}</h3>
            <p className="muted">
              {shown(detail.order.equipamento)} ·{" "}
              {shown(detail.order.modelo_equipamento)}
            </p>
            <a
              className="manual-history-link"
              href={
                "/fabricante?" +
                new URLSearchParams({
                  company: String(detail.order.company_id || ""),
                  model: String(detail.order.modelo_equipamento || ""),
                  serial: String(
                    detail.order.numero_serie || detail.order.serie || "",
                  ),
                })
              }
            >
              Consultar peças do fabricante e histórico da série
            </a>
            {!detail.detail_at && (
              <div className="notice">
                <Clock3 size={16} />
                Os detalhes desta OS ainda estão sendo importados. A lista de
                materiais e serviços pode estar incompleta.
              </div>
            )}
            {!!detail.equipment_links?.length && (
              <section className="registered-equipment">
                <h4>
                  <Wrench size={17} /> Equipamentos identificados
                </h4>
                {detail.equipment_links.map((eq) => (
                  <div
                    className="registered-equipment-card"
                    key={eq.equipment_id}
                  >
                    <strong>{eq.name}</strong>
                    <p>
                      Modelo: {eq.model || "Conferir no cadastro"} · Série:{" "}
                      {eq.serial || "Não identificada"}
                    </p>
                    <span
                      className={
                        eq.method === "review"
                          ? "quote-warning"
                          : "equipment-origin"
                      }
                    >
                      {
                        (
                          {
                            explicit: "Vínculo explícito no ERP",
                            serial: "Série estruturada + cadastro do cliente",
                            observation:
                              "Série nas observações · associação automática",
                            review: "Possível vínculo · precisa de conferência",
                          } as Record<string, string>
                        )[eq.method]
                      }
                    </span>
                    <p className="muted">
                      {eq.evidence.reason} · Origem: {eq.evidence.field} ·
                      Valor: {eq.evidence.value}
                      {eq.serial_source === "nome"
                        ? " · Série extraída do nome do cadastro"
                        : ""}
                    </p>
                    {eq.method !== "review" && (
                      <a
                        href={
                          "/fabricante?" +
                          new URLSearchParams({
                            company: String(detail.order.company_id || ""),
                            model: eq.model || "",
                            serial: eq.serial || "",
                          })
                        }
                      >
                        Consultar histórico e peças do fabricante
                      </a>
                    )}
                  </div>
                ))}
              </section>
            )}
            <h4>
              <Package size={17} />
              Materiais aplicados{" "}
              <span className="count-pill">{detail.materials.length}</span>
            </h4>
            {detail.materials.length ? (
              detail.materials.map((p, i) => (
                <details className="material-detail" key={i}>
                  <summary>
                    <div>
                      <strong
                        className={
                          p.esta_excluido === true
                            ? "excluded-description"
                            : isNotApproved(p.aprovado)
                              ? "unapproved-description"
                              : undefined
                        }
                      >
                        {shown(p.produto_nome)}
                      </strong>
                      {p.esta_excluido === true && (
                        <small className="excluded-label">Excluído da OS</small>
                      )}
                      {isNotApproved(p.aprovado) && !p.esta_excluido && (
                        <small className="unapproved-description">
                          Reprovado na OS
                        </small>
                      )}
                      <small>Código: {shown(p.produto_id)}</small>
                      <small>
                        Ref. fabricante: {shown(p.referencia_fabricante)}
                      </small>
                    </div>
                    <div className="item-amount">
                      <span>
                        {shown(p.quantidade)} {shown(p.unidade_nome)}{" "}
                        <ChevronDown size={15} />
                      </span>
                      <strong aria-label="Valor total do material">
                        {money(p.valor_total)}
                      </strong>
                    </div>
                  </summary>
                  <ProductPhotos
                    company={detail.order.company_id}
                    id={p.produto_id}
                    name={p.produto_nome}
                  />
                  <div className="product-detail-current">
                    <div>
                      <h4>Preços atuais</h4>
                      <PriceValues
                        current={p.current as ProductCurrent | undefined}
                      />
                    </div>
                    <div>
                      <h4>Estoque atual da empresa</h4>
                      <StockValues
                        current={p.current as ProductCurrent | undefined}
                      />
                    </div>
                  </div>
                  <FieldList fields={p} />
                </details>
              ))
            ) : (
              <p className="muted">
                {detail.detail_at
                  ? "Nenhum material registrado."
                  : "Aguardando coleta dos materiais."}
              </p>
            )}
            <h4>
              <Wrench size={17} />
              Serviços aplicados{" "}
              <span className="count-pill">
                {(detail.services || []).length}
              </span>
            </h4>
            {(detail.services || []).length ? (
              detail.services!.map((service, i) => (
                <details className="material-detail service-detail" key={i}>
                  <summary>
                    <div>
                      <strong>{shown(service.servico_nome)}</strong>
                      <small>Código: {shown(service.servico_id)}</small>
                      <small>
                        Valor unitário: {money(service.valor_unitario)}
                      </small>
                    </div>
                    <div className="item-amount">
                      <span>
                        Qtd.: {shown(service.quantidade)}{" "}
                        <ChevronDown size={15} />
                      </span>
                      <strong aria-label="Valor total do serviço">
                        {money(service.valor_total)}
                      </strong>
                    </div>
                  </summary>
                  <FieldList fields={service} />
                </details>
              ))
            ) : (
              <p className="muted">
                {detail.detail_at
                  ? "Nenhum serviço registrado."
                  : "Aguardando coleta dos serviços."}
              </p>
            )}
            <OrderAmounts
              key={`${selection?.company_id}:${selection?.id}`}
              detail={detail}
            />
            <details className="all-fields">
              <summary>
                Todos os campos da OS
                <ChevronDown size={17} />
              </summary>
              <FieldList fields={detail.order} />
            </details>
            {detail.equipment.map((eq, i) => (
              <details className="all-fields" key={i}>
                <summary>
                  Equipamento {i + 1} · {shown(eq.numero_serie)}
                  <ChevronDown size={17} />
                </summary>
                <a
                  className="manual-history-link"
                  href={
                    "/fabricante?" +
                    new URLSearchParams({
                      company: String(detail.order.company_id || ""),
                      model: String(eq.equipamento_modelo || ""),
                      serial: String(eq.numero_serie || ""),
                    })
                  }
                >
                  Consultar peças do fabricante deste equipamento
                </a>
                <FieldList fields={eq} />
              </details>
            ))}
            <p className="drawer-updated">
              <Check size={14} />
              {detail.detail_at
                ? `Detalhes importados em ${date(detail.detail_at, true)}`
                : "Cabeçalho disponível; detalhes pendentes"}
            </p>
          </div>
        )}
      </div>
    </dialog>
  );
}
