"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Pencil, RefreshCw } from "lucide-react";
import SiteHeader from "./site-header";
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
  ...shared,
  { key: "status", label: "Situação" },
  { key: "orderType", label: "Tipo de OS" },
  { key: "flowStatus", label: "Status do fluxo" },
  { key: "expected", label: "Entrega prevista", type: "date" },
  { key: "amount", label: "Valor total", type: "money" },
  { key: "billingState", label: "Conferência do faturamento" },
  { key: "billingAmount", label: "Notas válidas (acumulado)", type: "money" },
  { key: "billingBalance", label: "Saldo a conferir", type: "money" },
  { key: "billingDocuments", label: "Notas vinculadas" },
  { key: "modality", label: "Modalidade" },
  { key: "flowOwner", label: "Responsável do fluxo" },
  { key: "notes", label: "Observação" },
  { key: "equipment", label: "Equipamento" },
  { key: "opened", label: "Abertura", type: "date" },
  { key: "billedDate", label: "Faturamento", type: "date" },
  { key: "seller", label: "Vendedor" },
];
export function reportValue(row: Detail, key: string): string | number {
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
    setBusy(true);
    setError("");
    setData(null);
    fetch("/api/sales-projection?period=" + period, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setBusy(false);
      });
    return () => ctrl.abort();
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
  const visible = useMemo(
    () =>
      base
        .filter(
          (r) =>
            (company === "all" || String(r.company) === company) &&
            (kind === "contracts" ||
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
    [base, company, status, query, filters, sort, kind, billingFilter],
  );
  const title = kind === "contracts" ? "Contratos" : "Vendas";
  const back = `/comercial/projecao?period=${period}&company=${company}`;
  const returnTo = `/comercial/vendas?period=${period}&company=${company}&status=${status}&billing=${billingFilter}`;
  const display = (r: Detail, c: Col) => {
    const v = reportValue(r, c.key);
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
        <section className="cr-filters">
          <label>
            Competência
            <input
              type="month"
              value={period}
              onChange={(e) => {
                if (e.target.value) setPeriod(e.target.value);
              }}
            />
          </label>
          <label>
            Empresa
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="all">Todas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {kind === "sales" && (
            <label>
              Situação
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
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
          <button
            className="button"
            onClick={() => {
              setFilters({});
              setQuery("");
              setCompany("all");
              setStatus("all");
              setBillingFilter("all");
            }}
          >
            Limpar filtros
          </button>
        </section>
        {error && (
          <p role="alert" className="sp-notice">
            {error}
          </p>
        )}
        {busy && <p role="status">Carregando {title.toLowerCase()}…</p>}
        {data && !busy && (
          <>
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
            {kind === "sales" && (
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
              <table className="cr-table">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} data-column={c.key}>
                        <div className="cr-column">
                          <span>{c.label}</span>
                          <ColumnFilter
                            arrowOnly
                            label={c.label}
                            values={[
                              ...new Set(
                                base.map((r) => String(reportValue(r, c.key))),
                              ),
                            ].sort()}
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
                          {c.key === "billingState" ? (
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
                          ) : c.key === "id" ? (
                            <span className="cr-code">
                              {kind === "sales" ? "OS-" : ""}
                              {display(r, c)}
                            </span>
                          ) : c.key === "company" ? (
                            <span className="cr-company">{display(r, c)}</span>
                          ) : c.key === "status" ? (
                            <span
                              className={`cr-status ${r.kind === "salesPending" ? "pending" : "processed"}`}
                            >
                              {display(r, c)}
                            </span>
                          ) : (
                            display(r, c)
                          )}
                          {c.key === "expected" && r.overdue && (
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
                              href={`/OrdemServico/editar?empresa=${r.fields?.sourceCompany || r.company}&id=${r.id}&returnTo=${encodeURIComponent(returnTo)}`}
                            >
                              <Pencil size={14} /> Editar
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
