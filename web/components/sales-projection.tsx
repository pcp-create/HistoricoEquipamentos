"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  RefreshCw,
  Target,
  TrendingUp,
  X,
  Search,
} from "lucide-react";
import ProjectionSyncButton from "./projection-sync-button";
import SiteHeader from "./site-header";
import CommercialPeriodFilter from "./commercial-period-filter";
import type { ProjectionData } from "@/lib/sales-projection/store";
import { sumRows, type Summary } from "@/lib/sales-projection/model";
import "./sales-projection.css";
const money = (n: number) =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const percent = (n: number, d: number) =>
  d
    ? ((n / d) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) +
      "%"
    : "—";
const labels: Record<string, string> = {
  contracts: "Contratos previstos",
  contractBilled: "Contratos faturados",
  invoices: "Demais notas de venda",
  returns: "Devoluções",
  salesPending: "Vendas pendentes",
  salesBilled: "Vendas faturadas",
};
const columns: [keyof Summary, string][] = [
  ["projection", "Projeção"],
  ["contractBilled", "Fat. contratos"],
  ["salesBilled", "Fat. OSs"],
  ["other", "Fat. outros"],
  ["returns", "Devoluções"],
  ["billed", "Total líquido"],
  ["pending", "A faturar"],
];
export default function SalesProjection({
  initialPeriod,
  initialCompany,
}: { initialPeriod?: string; initialCompany?: string } = {}) {
  const [period, setPeriod] = useState(
    () =>
      initialPeriod ||
      new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" })
        .format(new Date())
        .slice(0, 7),
  );
  const [data, setData] = useState<ProjectionData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [company, setCompany] = useState(initialCompany || "all");
  const [detail, setDetail] = useState(""),
    [search, setSearch] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    let running = false;
    setData(null);
    async function load(initial = false) {
      if (running || ctrl.signal.aborted) return;
      running = true;
      if (initial) setLoading(true);
      try {
        const r = await fetch("/api/sales-projection?period=" + period, {signal:ctrl.signal,cache:"no-store"});
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!ctrl.signal.aborted) {setData(d); setError("");}
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message);
      } finally {
        running = false;
        if (!ctrl.signal.aborted && initial) setLoading(false);
      }
    }
    void load(true);
    const timer = setInterval(() => {if (!document.hidden) void load();}, 60000);
    const visible = () => {if (!document.hidden) void load();};
    document.addEventListener("visibilitychange", visible);
    return () => {ctrl.abort();clearInterval(timer);document.removeEventListener("visibilitychange", visible);};
  }, [period, refresh]);
  const rows =
    data?.rows.filter(
      (r) => company === "all" || String(r.company) === company,
    ) || [];
  const total = rows.length ? sumRows(rows) : null;
  const items = useMemo(
    () =>
      data?.details.filter(
        (d) =>
          (company === "all" || String(d.company) === company) &&
          (detail === "all" || d.kind === detail) &&
          search
            .toLocaleLowerCase()
            .split(/\s+/)
            .every((s) => `${d.id} ${d.name}`.toLocaleLowerCase().includes(s)),
      ) || [],
    [data, company, detail, search],
  );
  function open(kind: string) {
    if (
      ["contracts", "contractBilled", "salesPending", "salesBilled"].includes(
        kind,
      )
    ) {
      const page = kind.startsWith("sales") ? "vendas" : "contratos";
      window.location.assign(
        `/comercial/${page}?period=${period}&company=${company}&status=${kind === "salesPending" ? "Pendente" : kind === "salesBilled" ? "Processado" : "all"}`,
      );
      return;
    }
    setDetail(kind);
    setSearch("");
    dialog.current?.showModal();
  }
  function exportCsv() {
    if (!total) return;
    const csv = [
      ["Empresa", ...columns.map((c) => c[1])],
      ...[...rows, total].map((r) => [
        r.name,
        ...columns.map(([k]) => money(Number(r[k]))),
      ]),
    ]
      .map((r) =>
        r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `projecao-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const target = company === "all" ? data?.target : null;
  return (
    <>
      <SiteHeader active="salesProjection" />
      <main className="sales-projection">
        <div className="sp-heading">
          <div>
            <span className="eyebrow">COMERCIAL / RESULTADOS</span>
            <h1>Projeção de Vendas</h1>
            <p>O resultado de hoje. O caminho até a meta.</p>
          </div>
          <div className="sp-actions"><ProjectionSyncButton onComplete={() => setRefresh((n) => n + 1)} />
            <Link className="button" href="/comercial/resumo">Resumo gerencial</Link>
            <Link className="button" href="/comercial/parciais">Parciais e movimentações</Link>
            <button
              className="button"
              onClick={exportCsv}
              disabled={!total || loading}
            >
              <Download size={16} /> Exportar
            </button>
            <button
              className="button primary"
              onClick={() => setRefresh((v) => v + 1)}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "sp-spin" : ""} />{" "}
              Atualizar
            </button>
          </div>
        </div>
        <CommercialPeriodFilter
          period={period}
          company={company}
          onPeriodChange={setPeriod}
          onCompanyChange={setCompany}
          companies={data?.rows || []}
        />
        {error && (
          <div className="sp-notice" role="alert">
            {error}{" "}
            <button onClick={() => setRefresh((v) => v + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {loading && (
          <div className="sp-loading" role="status">
            <RefreshCw className="sp-spin" /> Conferindo os resultados do
            período…
          </div>
        )}
        {!loading && data && total && (
          <>
            {!data.complete && (
              <p className="sp-notice" role="status">
                Importação em andamento. Os valores podem estar incompletos até
                a conclusão das quatro tabelas nas três empresas.
              </p>
            )}
            <section
              className={`sp-kpis${target != null ? " sp-kpis-with-gap" : ""}`}
              aria-label="Indicadores do período"
            >
              <article className="sp-kpi sp-feature">
                <span>
                  <TrendingUp size={20} /> Projeção do mês
                </span>
                <strong>
                  <small>R$</small> {money(total.projection)}
                </strong>
                <p>
                  {target
                    ? `${percent(total.projection, target)} da meta do grupo`
                    : "Faturamento líquido + valores pendentes"}
                </p>
                <div className="sp-track">
                  <i
                    style={{
                      width: `${target ? Math.max(0, Math.min(100, (total.projection / target) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </article>
              <article className="sp-kpi">
                <span>
                  <CheckCircle2 size={20} /> Total faturado líquido
                </span>
                <strong className="sp-green">
                  <small>R$</small> {money(total.billed)}
                </strong>
                <p>
                  {percent(total.billed, total.projection)} da projeção
                  realizada
                </p>
                <button className="sp-text-button" onClick={() => open("all")}>
                  Explorar composição <ArrowUpRight size={14} />
                </button>
              </article>
              <article className="sp-kpi">
                <span>
                  <CalendarDays size={20} /> A faturar
                </span>
                <strong>
                  <small>R$</small> {money(total.pending)}
                </strong>
                <p>Contratos e vendas ainda pendentes</p>
                <button
                  className="sp-text-button"
                  onClick={() => open("salesPending")}
                >
                  Ver vendas pendentes <ArrowUpRight size={14} />
                </button>
              </article>
              <article className="sp-kpi">
                <span>
                  <Target size={20} />{" "}
                  {target ? "Meta de faturamento" : "Meta do período"}
                </span>
                <strong>
                  {target ? (
                    <>
                      <small>R$</small> {money(target)}
                    </>
                  ) : (
                    "—"
                  )}
                </strong>
                <p>
                  {target
                    ? `${money(Math.max(0, target - total.projection))} além da projeção para atingir a meta`
                    : company !== "all"
                      ? "A meta disponível é consolidada para o grupo."
                      : "Meta não cadastrada para este mês."}
                </p>
              </article>
              {target != null && (
                <article
                  className="sp-kpi sp-target-gap"
                  aria-label="À buscar da meta"
                >
                  <span>
                    <Target size={20} /> À buscar da meta
                  </span>
                  <strong>
                    <small>R$</small>{" "}
                    {money(Math.max(0, target - total.projection))}
                  </strong>
                  <p>
                    {total.projection >= target
                      ? "Meta coberta pela projeção."
                      : `${percent(target - total.projection, target)} da meta ainda precisa entrar na projeção.`}
                  </p>
                </article>
              )}
            </section>
            <section className="sp-panel">
              <div className="sp-panel-heading">
                <div>
                  <h2>Resultado por empresa</h2>
                  <p>
                    Devoluções em coluna própria, descontadas uma única vez do
                    total.
                  </p>
                </div>
                <span className="sp-unit">VALORES EM R$</span>
              </div>
              <div className="sp-table-scroll">
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      {columns.map(([k, label]) => (
                        <th key={k}>
                          {label}
                          {k === "returns" && (
                            <span className="sp-minus"> (−)</span>
                          )}
                        </th>
                      ))}
                      <th>Realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.company}>
                        <th>{r.name}</th>
                        {columns.map(([k]) => (
                          <td
                            key={k}
                            className={
                              k === "returns"
                                ? "sp-red"
                                : k === "billed"
                                  ? "sp-green"
                                  : ""
                            }
                          >
                            {k === "other" && Number(r[k]) < 0 ? (
                              <Link
                                className="sp-other-review"
                                href={`/comercial/vendas?period=${period}&company=${r.company}&billing=partial`}
                                title="Conferir OS com possíveis faturamentos parciais"
                              >
                                {money(Number(r[k]))} <ArrowUpRight size={12} />
                              </Link>
                            ) : (
                              money(Number(r[k]))
                            )}
                          </td>
                        ))}
                        <td>
                          <div className="sp-realized">
                            <span>{percent(r.billed, r.projection)}</span>
                            <div className="sp-track">
                              <i
                                style={{
                                  width: `${Math.max(0, Math.min(100, r.projection ? (r.billed / r.projection) * 100 : 0))}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      {columns.map(([k]) => (
                        <td key={k}>{money(Number(total[k]))}</td>
                      ))}
                      <td>{percent(total.billed, total.projection)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="sp-footnote">
                Faturamento outros = notas de venda − contratos faturados − OS
                faturadas. Pode ser negativo quando essas bases apresentam
                diferenças de classificação ou atualização.
              </p>
            </section>
            <div className="sp-bottom">
              <section className="sp-panel">
                <div className="sp-panel-heading">
                  <div>
                    <h2>O que compõe a projeção</h2>
                    <p>Abra os documentos para acompanhar cada etapa.</p>
                  </div>
                  <BarChart3 size={21} />
                </div>
                <div className="sp-composition">
                  <article>
                    <div className="sp-line">
                      <h3>Contratos</h3>
                      <strong>R$ {money(total.contracts)}</strong>
                    </div>
                    <div className="sp-line">
                      <button onClick={() => open("contractBilled")}>
                        Faturados <ArrowUpRight size={14} />
                      </button>
                      <span className="sp-green">
                        {money(total.contractBilled)}
                      </span>
                    </div>
                    <div className="sp-line">
                      <button onClick={() => open("contracts")}>
                        Previstos no mês <ArrowUpRight size={14} />
                      </button>
                      <span>{money(total.contracts)}</span>
                    </div>
                    <div className="sp-line">
                      <span>Saldo a faturar</span>
                      <strong>{money(total.contractPending)}</strong>
                    </div>
                  </article>
                  <article>
                    <div className="sp-line">
                      <h3>Vendas / OS</h3>
                      <strong>
                        R$ {money(total.salesBilled + total.salesPending)}
                      </strong>
                    </div>
                    <div className="sp-line">
                      <button onClick={() => open("salesBilled")}>
                        Faturadas <ArrowUpRight size={14} />
                      </button>
                      <span className="sp-green">
                        {money(total.salesBilled)}
                      </span>
                    </div>
                    <div className="sp-line">
                      <button onClick={() => open("salesPending")}>
                        Pendentes <ArrowUpRight size={14} />
                      </button>
                      <span>{money(total.salesPending)}</span>
                    </div>
                    <div className="sp-line">
                      <button onClick={() => open("returns")}>
                        <ArrowDownLeft size={14} /> Devoluções{" "}
                        <ArrowUpRight size={14} />
                      </button>
                      <strong className="sp-red">
                        − {money(total.returns)}
                      </strong>
                    </div>
                  </article>
                </div>
              </section>
              <section className="sp-panel">
                <div className="sp-panel-heading">
                  <div>
                    <h2>Participação no faturamento</h2>
                    <p>Distribuição do resultado líquido.</p>
                  </div>
                </div>
                <div className="sp-ranking">
                  {[...rows]
                    .sort((a, b) => b.billed - a.billed)
                    .map((r, i) => (
                      <div key={r.company}>
                        <div className="sp-line">
                          <span>
                            <b className="sp-rank">0{i + 1}</b>
                            {r.name}
                          </span>
                          <strong>{percent(r.billed, total.billed)}</strong>
                        </div>
                        <div className="sp-track">
                          <i
                            style={{
                              width: `${Math.max(0, Math.min(100, total.billed ? (r.billed / total.billed) * 100 : 0))}%`,
                            }}
                          />
                        </div>
                        <small>R$ {money(r.billed)}</small>
                      </div>
                    ))}
                </div>
              </section>
            </div>
            <footer className="sp-footer">
              <span>OSs: {data.ordersUpdatedAt ? new Date(data.ordersUpdatedAt).toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"}) : "Aguardando coleta rápida"} · Atualização automática da tela a cada minuto</span>
              <span>
                <span className="sp-dot" />{" "}
                {data.updatedAt
                  ? `Base comercial atualizada a partir de ${new Date(data.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                  : "Aguardando integração"}
              </span>
              <span>
                Metas conforme cadastro do PBIX · OS vencidas projetadas para o
                mês atual
              </span>
            </footer>
          </>
        )}
        <dialog
          ref={dialog}
          className="sp-dialog"
          onClose={() => setDetail("")}
        >
          <div className="sp-panel-heading">
            <div>
              <h2>{labels[detail] || "Composição dos valores"}</h2>
              <p>
                {items.length} registros · {period.slice(5)}/
                {period.slice(0, 4)}
              </p>
            </div>
            <button
              className="button"
              aria-label="Fechar detalhes"
              onClick={() => dialog.current?.close()}
            >
              <X size={18} />
            </button>
          </div>
          <label className="sp-search">
            <Search size={18} />
            <input
              aria-label="Pesquisar documentos"
              placeholder="Pesquisar cliente ou documento"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="sp-detail-scroll">
            <table className="sp-table">
              <thead>
                <tr>
                  <th>Documento / cliente</th>
                  <th>Origem</th>
                  <th>Data</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d, i) => (
                  <tr key={`${d.kind}-${d.company}-${d.id}-${i}`}>
                    <td>
                      {d.kind.startsWith("sales") ? (
                        <Link
                          href={`/historico?createdCompany=${d.company}&createdOrder=${encodeURIComponent(d.id)}&module=crm`}
                        >
                          OS {d.id} <ArrowUpRight size={12} />
                        </Link>
                      ) : (
                        <strong>#{d.id}</strong>
                      )}
                      <div>{d.name}</div>
                      {d.overdue && (
                        <small className="sp-red">
                          Previsão vencida · incluída no mês atual
                        </small>
                      )}
                    </td>
                    <td>
                      {labels[d.kind]}
                      <small className="sp-origin">
                        {data?.rows.find((r) => r.company === d.company)?.name}
                      </small>
                    </td>
                    <td>{d.date.split("-").reverse().join("/")}</td>
                    <td>{money(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && (
              <p className="sp-empty">
                Nenhum documento encontrado neste período.
              </p>
            )}
          </div>
        </dialog>
      </main>
    </>
  );
}
