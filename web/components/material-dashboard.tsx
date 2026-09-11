"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Info,
  LoaderCircle,
  Package,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import SiteHeader from "./site-header";
import {
  brazilToday,
  offsetDate,
  type AnalysisFilters,
  type Coverage,
  type PlannedMaterial,
} from "@/lib/material-planning";

type Data = {
  email: string;
  filters: AnalysisFilters;
  coverage: Coverage[];
  units: string[];
  topFrequency: PlannedMaterial[];
  topQuantity: PlannedMaterial[];
  total: number;
  page: number;
  size: number;
  rows: PlannedMaterial[];
  summary: {
    materials: number;
    estimable: number;
    eligible: number;
    complete: number;
  };
};
type Input = {
  from: string;
  to: string;
  company: string;
  q: string;
  unit: string;
  sort: string;
  lead: string;
  safety: string;
  review: string;
};
const n = (value: number, digits = 2) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(
    value,
  );
const date = (s: string) => s.split("-").reverse().join("/");
function defaults(): Input {
  const to = offsetDate(brazilToday(), -1);
  return {
    from: offsetDate(to, -179),
    to,
    company: "",
    q: "",
    unit: "",
    sort: "frequency",
    lead: "7",
    safety: "7",
    review: "30",
  };
}
function params(input: Input, page: number) {
  return new URLSearchParams({ ...input, page: String(page), size: "25" });
}
function historyLink(r: PlannedMaterial, input: Input) {
  return (
    "/?" +
    new URLSearchParams({
      view: "materials",
      company: String(r.company_id),
      productId: r.product_id,
      status: "Processado",
      from: input.from,
      to: input.to,
    })
  );
}
export default function MaterialDashboard() {
  const [draft, setDraft] = useState<Input | null>(null),
    [filters, setFilters] = useState<Input | null>(null),
    [page, setPage] = useState(1),
    [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const input = defaults(),
      query = new URLSearchParams(window.location.search);
    for (const key of Object.keys(input) as (keyof Input)[])
      if (query.has(key)) input[key] = query.get(key)!;
    if (!input.unit || input.unit === "(sem unidade)") input.sort = "frequency";
    setDraft(input);
    setFilters(input);
    const p = Number(query.get("page"));
    if (Number.isSafeInteger(p) && p > 0) setPage(p);
  }, []);
  useEffect(() => {
    if (!filters) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = params(filters, page);
    window.history.replaceState(null, "", `/analise-materiais?${query}`);
    fetch(`/api/material-analysis?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login");
          throw new Error("Sessão expirada");
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body as Data;
      })
      .then((result) => {
        setData(result);
        if (result.page !== page) setPage(result.page);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, refresh]);
  function field(key: keyof Input, value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
            ...(key === "unit" && (!value || value === "(sem unidade)")
              ? { sort: "frequency" }
              : {}),
          }
        : current,
    );
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    if (draft) {
      setFilters({ ...draft });
      setPage(1);
    }
  }
  function preset(days: number) {
    const to = offsetDate(brazilToday(), -1);
    setDraft((current) =>
      current ? { ...current, to, from: offsetDate(to, -days + 1) } : current,
    );
  }
  async function exportCsv() {
    if (!filters) return;
    setExporting(true);
    try {
      const query = params(filters, 1);
      query.set("export", "csv");
      const response = await fetch(`/api/material-analysis?${query}`);
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "analise-materiais.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  }
  const visibleData = !loading && !error ? data : null;
  const percent = data?.summary.eligible
    ? (100 * data.summary.complete) / data.summary.eligible
    : 0;
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / 25));
  return (
    <>
      <SiteHeader active="analysis" email={data?.email} />
      <main className="main analysis-main">
        <div className="page-heading">
          <div>
            <div className="eyebrow">ALMOXARIFADO / PLANEJAMENTO</div>
            <h1>
              Conheça o consumo. Planeje a reposição<span>.</span>
            </h1>
            <p>
              Veja os materiais mais aplicados e simule níveis de estoque com
              base no histórico das OS.
            </p>
          </div>
          <button
            className="button refresh-button"
            disabled={loading}
            onClick={() => setRefresh((r) => r + 1)}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Atualizar análise
          </button>
        </div>
        <form className="filter-panel analysis-filters" onSubmit={apply}>
          <div className="analysis-filter-title">
            <span>
              <Settings2 size={17} />
              Período e critérios da análise
            </span>
            <div className="period-presets">
              {[90, 180, 365].map((days) => (
                <button type="button" key={days} onClick={() => preset(days)}>
                  {days === 365 ? "12 meses" : `${days} dias`}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-grid">
            <label>
              Data inicial
              <input
                type="date"
                required
                value={draft?.from || ""}
                max={draft?.to}
                onChange={(e) => field("from", e.target.value)}
              />
            </label>
            <label>
              Data final
              <input
                type="date"
                required
                value={draft?.to || ""}
                min={draft?.from}
                max={offsetDate(brazilToday(), -1)}
                onChange={(e) => field("to", e.target.value)}
              />
            </label>
            <label>
              Empresa
              <select
                value={draft?.company || ""}
                onChange={(e) => field("company", e.target.value)}
              >
                <option value="">Todas, separadas no ranking</option>
                {["1", "2", "27404"].map((c) => (
                  <option key={c} value={c}>
                    Empresa {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unidade de medida
              <select
                value={draft?.unit || ""}
                onChange={(e) => field("unit", e.target.value)}
              >
                <option value="">Todas as unidades</option>
                {[
                  ...new Set([
                    ...(data?.units || []),
                    ...(draft?.unit ? [draft.unit] : []),
                  ]),
                ].map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              Material / referência
              <input
                placeholder="Código ou descrição"
                value={draft?.q || ""}
                maxLength={200}
                onChange={(e) => field("q", e.target.value)}
              />
            </label>
          </div>
          <div className="planning-inputs">
            <span className="planning-caption">
              <ShieldCheck size={17} />
              <span>
                Simulação de estoque
                <small>Parâmetros ajustáveis, em dias</small>
              </span>
            </span>
            <label>
              Reposição
              <input
                type="number"
                min="0"
                max="365"
                required
                value={draft?.lead ?? "7"}
                onChange={(e) => field("lead", e.target.value)}
              />
            </label>
            <label>
              Margem de segurança
              <input
                type="number"
                min="0"
                max="365"
                required
                value={draft?.safety ?? "7"}
                onChange={(e) => field("safety", e.target.value)}
              />
            </label>
            <label>
              Ciclo de revisão
              <input
                type="number"
                min="1"
                max="365"
                required
                value={draft?.review ?? "30"}
                onChange={(e) => field("review", e.target.value)}
              />
            </label>
            <button className="primary" disabled={!draft || loading}>
              <Search size={16} />
              Analisar materiais
            </button>
          </div>
        </form>
        <section className="stats">
          <Metric
            label="Materiais no período"
            value={data ? n(data.summary.materials) : "—"}
            note="Separados por empresa e unidade"
            icon={<Package size={21} />}
          />
          <Metric
            label="OS processadas analisadas"
            value={data ? n(data.summary.complete) : "—"}
            note={
              data
                ? `de ${n(data.summary.eligible)} OS no período`
                : "Aguardando consulta"
            }
            icon={<ClipboardList size={21} />}
          />
          <Metric
            label="Cobertura da importação"
            value={data ? `${n(percent, 1)}%` : "—"}
            note="Detalhes completos nas OS processadas"
            icon={<CheckCircle2 size={21} />}
          />
          <Metric
            label="Materiais com simulação"
            value={data ? n(data.summary.estimable) : "—"}
            note="Com base e amostra suficientes"
            icon={<Boxes size={21} />}
          />
        </section>
        {data && data.summary.complete < data.summary.eligible && (
          <div className="notice analysis-notice">
            <Info size={18} />
            <div>
              <strong>A importação ainda está em andamento.</strong>
              <p>
                O ranking mostra somente o consumo já coletado. Mínimo e máximo
                ficam indisponíveis nas empresas que ainda têm OS processadas
                pendentes neste período.
              </p>
            </div>
          </div>
        )}
        {data?.coverage.some((c) => c.ignored_items > 0 || c.undated > 0) && (
          <div className="notice analysis-notice">
            <Info size={18} />
            <div>
              <strong>Há registros que precisam de revisão.</strong>
              <p>
                {n(data.coverage.reduce((s, c) => s + c.ignored_items, 0))}{" "}
                itens com código ou quantidade inválidos e{" "}
                {n(data.coverage.reduce((s, c) => s + c.undated, 0))} OS
                processadas sem data. As empresas afetadas não recebem simulação
                de estoque.
              </p>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="error results-error">
            {error}
            <button onClick={() => setRefresh((r) => r + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        <section className="analysis-charts">
          <Ranking
            title="Mais frequentes nas OS"
            description="Número de ordens distintas com aplicação do material."
            rows={visibleData?.topFrequency || []}
            metric="orders"
            loading={loading}
            input={filters}
          />
          <Ranking
            title="Mais consumidos em quantidade"
            description={
              filters?.unit
                ? `Comparação na unidade ${filters.unit}.`
                : "Selecione uma unidade para comparar quantidades equivalentes."
            }
            rows={visibleData?.topQuantity || []}
            metric="quantity"
            loading={loading}
            input={filters}
          />
        </section>
        <section className="results-panel">
          <div className="results-heading">
            <div className="results-title">
              <span className="section-icon">
                <BarChart3 size={22} />
              </span>
              <div>
                <h2>Consumo e níveis de estoque</h2>
                <p>
                  Média diária calculada sobre todos os dias do período,
                  incluindo dias sem consumo.
                </p>
              </div>
            </div>
            <button
              className="button export"
              onClick={exportCsv}
              disabled={loading || exporting || !data?.total}
            >
              {exporting ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ArrowDownToLine size={16} />
              )}
              Exportar CSV
            </button>
          </div>
          <div className="results-toolbar">
            <span className="result-count">
              <strong>{n(data?.total || 0)}</strong> materiais encontrados
            </span>
            <label className="sort-inline">
              Ordenar por
              <select
                aria-label="Ordenar materiais"
                value={filters?.sort || "frequency"}
                onChange={(e) => {
                  if (filters) {
                    const next = { ...filters, sort: e.target.value };
                    setFilters(next);
                    setDraft(next);
                    setPage(1);
                  }
                }}
              >
                <option value="frequency">Frequência em OS</option>
                <option
                  value="quantity"
                  disabled={!filters?.unit || filters.unit === "(sem unidade)"}
                >
                  Quantidade (mesma unidade)
                </option>
              </select>
            </label>
          </div>
          <div className="table-scroll" aria-busy={loading}>
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Material aplicado</th>
                  <th>Empresa</th>
                  <th>Unidade</th>
                  <th className="numeric">Qtd. aplicada</th>
                  <th className="numeric">OS distintas</th>
                  <th className="numeric">Média / 30 dias</th>
                  <th>Última aplicação</th>
                  <th className="numeric">
                    Mínimo sugerido<small>Ponto de pedido</small>
                  </th>
                  <th className="numeric">
                    Máximo sugerido<small>Nível alvo</small>
                  </th>
                  <th>
                    <span className="sr-only">Histórico</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr className="skeleton-row" key={i}>
                        {Array.from({ length: 10 }, (_, j) => (
                          <td key={j}>
                            <span className="skeleton" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : !error &&
                    data?.rows.map((r) => (
                      <tr key={`${r.company_id}-${r.product_id}-${r.unit_key}`}>
                        <td>
                          <span className="cell-title" title={r.name}>
                            {r.name}
                          </span>
                          <small className="cell-secondary">
                            Código: {r.product_id}
                          </small>
                          <small className="cell-secondary">
                            Ref. fabricante: {r.reference || "Não informada"}
                          </small>
                        </td>
                        <td>
                          <span className="company-tag">{r.company_id}</span>
                        </td>
                        <td>{r.unit || "Não informada"}</td>
                        <td className="numeric">
                          <strong>{n(r.quantity)}</strong>
                        </td>
                        <td className="numeric">
                          {n(r.orders)}
                          <small className="cell-secondary">
                            em {n(r.active_days)} dias
                          </small>
                        </td>
                        <td className="numeric">{n(r.monthly)}</td>
                        <td className="nowrap">{date(r.last_used)}</td>
                        {r.reason ? (
                          <td colSpan={2} className="planning-blocked">
                            <span>
                              <Info size={13} />
                              {r.reason}
                            </span>
                          </td>
                        ) : (
                          <>
                            <td className="numeric">
                              <span className="stock-min">{n(r.minimum!)}</span>
                            </td>
                            <td className="numeric">
                              <span className="stock-max">{n(r.maximum!)}</span>
                            </td>
                          </>
                        )}
                        <td>
                          <a
                            className="detail-button"
                            title="Consultar aplicações no histórico"
                            aria-label={`Consultar histórico do material ${r.product_id}`}
                            href={filters ? historyLink(r, filters) : "/"}
                          >
                            <ArrowRight size={16} />
                          </a>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && !error && !data?.rows.length && (
              <div className="empty">
                <Package size={34} />
                <h3>Nenhum consumo disponível neste período</h3>
                <p>
                  Amplie o período ou aguarde a importação das OS processadas.
                </p>
              </div>
            )}
          </div>
          <div className="pagination">
            <span>
              Página <b>{data?.page || page}</b> de <b>{totalPages}</b> · 25
              materiais por página
            </span>
            <div className="page-buttons">
              <button
                disabled={loading || page <= 1}
                aria-label="Página anterior"
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>{data?.page || page}</span>
              <button
                disabled={loading || page >= totalPages}
                aria-label="Próxima página"
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
        <details className="analysis-method">
          <summary>
            <Info size={17} />
            Como interpretar esta análise
          </summary>
          <div>
            <p>
              <strong>Consumo:</strong> quantidades positivas de materiais
              ativos em OS com status Processado e detalhes finalizados. A data
              da OS é usada como aproximação da data de consumo. OS abertas,
              canceladas e itens excluídos ficam fora.
            </p>
            <p>
              <strong>Frequência:</strong> quantidade de OS distintas em que o
              material aparece. Não representa o giro contábil do estoque, que
              exige saldo médio e movimentações do almoxarifado.
            </p>
            <p>
              <strong>Mínimo / ponto de pedido:</strong> média diária × (dias de
              reposição + dias de segurança).
            </p>
            <p>
              <strong>Máximo / nível alvo:</strong> média diária × (reposição +
              segurança + ciclo de revisão). A margem de segurança e o ciclo
              começam em 7 e 30 dias como parâmetros de simulação.
            </p>
            <p>
              As médias incluem dias sem consumo. Quantidades são arredondadas
              para cima: peças/unidades para inteiros e demais unidades para
              duas casas. Empresas e unidades não são somadas entre si. A
              estimativa exige importação completa da empresa, ao menos 30 dias
              de período e aplicação em 3 dias distintos.
            </p>
            <p>
              Os resultados orientam a revisão do cadastro. Não consideram saldo
              atual, pedidos de compra, consumo fora das OS, lotes de compra ou
              sazonalidade e não geram pedidos automaticamente. Produtos sem
              aplicação no período não entram no ranking.
            </p>
          </div>
        </details>
        <footer>
          <span>
            <TrendingUp size={14} />
            Análise de materiais · Planejamento do almoxarifado
          </span>
          <span>
            <CalendarDays size={14} />
            {filters
              ? `${date(filters.from)} a ${date(filters.to)} · Brasília`
              : ""}
          </span>
        </footer>
      </main>
    </>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Ranking({
  title,
  description,
  rows,
  metric,
  loading,
  input,
}: {
  title: string;
  description: string;
  rows: PlannedMaterial[];
  metric: "orders" | "quantity";
  loading: boolean;
  input: Input | null;
}) {
  const max = Math.max(1, ...rows.map((r) => r[metric]));
  return (
    <article className="ranking-card">
      <h2>{title}</h2>
      <p>{description}</p>
      {loading ? (
        <div className="empty">
          <LoaderCircle className="spin" />
          Carregando ranking...
        </div>
      ) : rows.length ? (
        <ol>
          {rows.map((r, i) => (
            <li key={`${r.company_id}-${r.product_id}-${r.unit_key}`}>
              <span className="ranking-position">{i + 1}</span>
              <div>
                <div className="ranking-label">
                  <a href={input ? historyLink(r, input) : "/"} title={r.name}>
                    {r.name}
                  </a>
                  <strong>
                    {n(r[metric])}{" "}
                    <small>{metric === "orders" ? "OS" : r.unit}</small>
                  </strong>
                </div>
                <small>
                  Cód. {r.product_id} · Empresa {r.company_id} ·{" "}
                  {r.unit || "Sem unidade"}
                </small>
                <div className="ranking-track">
                  <span style={{ width: `${(100 * r[metric]) / max}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="ranking-empty">
          <BarChart3 size={28} />
          {metric === "quantity" && !input?.unit
            ? "Escolha uma unidade nos filtros acima."
            : "Nenhum material encontrado."}
        </div>
      )}
    </article>
  );
}
