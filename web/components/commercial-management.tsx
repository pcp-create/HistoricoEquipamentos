"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Printer,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  Clock3,
  Target,
  ArrowUpRight,
  FileText,
  ArrowUp,
  ArrowDown,
  Minus,
  Settings,
  Trash2,
} from "lucide-react";
import SiteHeader from "./site-header";
import CommercialPeriodFilter from "./commercial-period-filter";
import type { ProjectionData } from "@/lib/sales-projection/store";
import { companies, sumRows, type Detail } from "@/lib/sales-projection/model";
import { compareProjection } from "@/lib/sales-projection/comparison";
import "./sales-projection.css";
import "./commercial-management.css";

type Snapshot = {
  id: string;
  label: string;
  period: string;
  created_at: string;
  created_by: string;
  document: ProjectionData;
};
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number, total: number) =>
  total > 0
    ? (value / total).toLocaleString("pt-BR", {
        style: "percent",
        maximumFractionDigits: 1,
      })
    : "—";
const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const kindName = (d: Detail) =>
  ({
    salesPending: "OS pendente",
    salesBilled: "OS faturada",
    contracts: "Contrato",
    contractBilled: "Faturamento de contrato",
    invoices: "Nota de venda",
    returns: "Devolução",
  })[d.kind] || d.kind;
async function request(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Não foi possível carregar os dados.");
  return data;
}
export default function CommercialManagement({
  canManage = false,
}: {
  canManage?: boolean;
}) {
  const [settings, setSettings] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [period, setPeriod] = useState(() =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" })
      .format(new Date())
      .slice(0, 7),
  );
  const [company, setCompany] = useState("all");
  const [live, setLive] = useState<ProjectionData | null>(null);
  const [list, setList] = useState<Omit<Snapshot, "document">[]>([]);
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("Parcial gerencial");
  const [refresh, setRefresh] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [changeType, setChangeType] = useState("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setLive(null);
    setSnapshot(null);
    setList([]);
    Promise.all([
      request("/api/sales-projection?period=" + period),
      request("/api/sales-projection/snapshots?period=" + period),
    ])
      .then(([data, partials]) => {
        if (!active) return;
        setLive(data);
        setList(partials.rows);
        setSelected((id) =>
          partials.rows.some((s: Snapshot) => s.id === id)
            ? id
            : partials.rows[0]?.id || "",
        );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [period, refresh]);
  useEffect(() => {
    let active = true;
    setSnapshot(null);
    if (selected)
      request(`/api/sales-projection/snapshots?period=${period}&id=${selected}`)
        .then((s) => {
          if (active) setSnapshot(s);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected, period, refresh]);
  const data = frozen ? snapshot?.document : live;
  const rows =
    data?.rows.filter(
      (r) => company === "all" || String(r.company) === company,
    ) || [];
  const total = rows.length ? sumRows(rows) : null;
  const oldRows =
    snapshot?.document.rows.filter(
      (r) => company === "all" || String(r.company) === company,
    ) || [];
  const oldTotal = oldRows.length ? sumRows(oldRows) : null;
  const scoped = (details: Detail[]) =>
    details.filter((d) => company === "all" || String(d.company) === company);
  const changes = useMemo(
    () =>
      snapshot && data
        ? compareProjection(
            scoped(snapshot.document.details),
            scoped(data.details),
          )
        : [],
    [snapshot, data, company],
  );
  const visible = changes.filter(
    (c) =>
      (changeType === "all" || c.type === changeType) &&
      `${c.before?.name || c.after?.name} ${c.before?.id || c.after?.id}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const previousOwners = new Map<string, number>();
  for (const d of scoped(snapshot?.document.details || []))
    if (d.kind === "salesPending") {
      const name = String(d.fields?.flowOwner || "Sem responsável");
      previousOwners.set(
        name,
        (previousOwners.get(name) || 0) + Math.round(d.amount * 100),
      );
    }
  const owners = new Map<string, number>();
  for (const d of scoped(data?.details || []))
    if (d.kind === "salesPending") {
      const name = String(d.fields?.flowOwner || "Sem responsável");
      owners.set(name, (owners.get(name) || 0) + Math.round(d.amount * 100));
    }
  async function removePartial(partial: Omit<Snapshot, "document">) {
    if (
      deleting ||
      !window.confirm(
        `Excluir a parcial “${partial.label}” de ${date(partial.created_at)}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setDeleting(partial.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/sales-projection/snapshots?period=${period}&id=${partial.id}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível excluir a parcial.");
      if (selected === partial.id) {
        setSnapshot(null);
        setSelected("");
        setFrozen(false);
      }
      setNotice("Parcial excluída.");
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting("");
    }
  }
  async function capture() {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    try {
      const saved = await request("/api/sales-projection/snapshots", {
        id,
        period,
        label,
      });
      setSelected(saved.id);
      setFrozen(true);
      setNotice(
        "Parcial registrada. O resumo congelado está disponível para impressão.",
      );
      setRequestId(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const monthName = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(period + "-01T12:00:00Z"));
  const periodLabel =
    monthName.charAt(0).toUpperCase() +
    monthName.slice(1) +
    "/" +
    period.slice(0, 4);
  const previousTarget = company === "all" ? snapshot?.document.target : null;
  const target = company === "all" ? data?.target : null;
  return (
    <>
      <SiteHeader active="salesProjection" />
      <main className="sales-projection cm-page">
        <nav className="cm-nav">
          <Link href="/comercial/projecao">← Projeção</Link>
          <Link href="/comercial/resumo">Resumo gerencial</Link>
        </nav>
        <div className="sp-heading">
          <div>
            <span className="eyebrow">COMERCIAL / GESTÃO</span>
            <h1>Resumo gerencial</h1>
            <p>
              Indicadores e movimentações em relação à parcial de referência
              selecionada.
            </p>
          </div>
          <div className="sp-actions">
            {canManage && (
              <button
                className="button"
                onClick={() => setSettings(!settings)}
                aria-expanded={settings}
              >
                <Settings size={16} /> Configurar parciais
              </button>
            )}
            <button
              className="button"
              onClick={() => window.print()}
              disabled={!total || busy}
            >
              <Printer size={16} /> Imprimir / PDF
            </button>
            <button
              className="button"
              onClick={() => setRefresh((n) => n + 1)}
              disabled={busy || saving}
            >
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
        </div>
        <div className="cm-controls">
          <CommercialPeriodFilter
            period={period}
            company={company}
            onPeriodChange={(value) => {
              setPeriod(value);
              setSelected("");
              setFrozen(false);
              setRequestId(null);
              setNotice("");
            }}
            onCompanyChange={setCompany}
            companies={companies.map((c) => ({ company: c.id, name: c.name }))}
          />
          <section className="cm-toolbar">
            <label>
              Parcial de referência
              <select
                aria-label="Parcial de referência"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={saving || !!deleting}
              >
                {!list.length && (
                  <option value="">Nenhuma parcial registrada</option>
                )}
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {date(s.created_at)} · {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visualização
              <select
                aria-label="Visualização"
                value={frozen ? "snapshot" : "live"}
                onChange={(e) => setFrozen(e.target.value === "snapshot")}
              >
                <option value="live">Projeção atual</option>
                <option value="snapshot" disabled={!selected}>
                  Parcial congelada
                </option>
              </select>
            </label>
            <label>
              Nome da nova parcial
              <input
                value={label}
                maxLength={120}
                disabled={saving || !!deleting}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setRequestId(null);
                }}
              />
            </label>
            <button
              className="button primary"
              onClick={capture}
              disabled={
                saving || !!deleting || busy || !live?.complete || !label.trim()
              }
            >
              <Camera size={16} />{" "}
              {saving ? "Registrando…" : "Registrar parcial agora"}
            </button>
          </section>
          <p className="sp-footnote">
            O registro congela as três empresas e a meta desta competência com
            os dados integrados no momento. Use “Registrar parcial agora” antes
            do envio de sexta-feira, às 12h (Brasília). Não há envio automático.
          </p>
        </div>
        {settings && canManage && (
          <section
            className="sp-panel cm-panel cm-settings"
            aria-label="Configuração de parciais"
          >
            <h2>Parciais da competência</h2>
            <p>A exclusão é definitiva e não altera a projeção atual.</p>
            {list.length ? (
              <ul>
                {list.map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{s.label}</strong>
                      <small>
                        {date(s.created_at)} · {s.created_by}
                      </small>
                    </div>
                    <button
                      className="button"
                      disabled={!!deleting || saving || busy}
                      onClick={() => removePartial(s)}
                      aria-label={`Excluir parcial ${s.label}`}
                    >
                      <Trash2 size={16} />
                      {deleting === s.id ? "Excluindo…" : "Excluir"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma parcial registrada nesta competência.</p>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="sp-notice">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="sp-notice">
            {notice}
          </p>
        )}
        {busy && <p role="status">Carregando informações…</p>}
        {live && !live.complete && (
          <p role="alert" className="sp-notice">
            Integração incompleta. O registro de parciais está bloqueado até a
            base ficar completa.
          </p>
        )}
        {!!live?.contractsWithoutSchedule && <p role="alert" className="sp-notice">{live.contractsWithoutSchedule} contrato(s) aguardando a coleta dos valores fixos e variáveis.</p>}
        {!!live?.ambiguousContractInvoices && <p role="alert" className="sp-notice">{live.ambiguousContractInvoices} nota(s) com correspondência em mais de um contrato, sem atribuição automática ao faturamento de contratos.</p>}
        {data && total && !busy && (
          <>
            <div className="cm-stamp">
              <strong>
                {period.split("-").reverse().join("/")} ·{" "}
                {company === "all"
                  ? "Grupo RJ — todas as empresas"
                  : rows[0]?.name}
              </strong>
              <span>
                {frozen && snapshot
                  ? `Parcial: ${date(snapshot.created_at)} · ${snapshot.created_by}`
                  : `Base integrada: ${data.updatedAt ? date(data.updatedAt) : "sem data"}`}
              </span>
            </div>
            <section className="cm-kpis">
              {[
                {
                  title: `Projeção · ${periodLabel}`,
                  value: total.projection,
                  base: target,
                  note: "da meta projetada",
                  icon: TrendingUp,
                  tone: "projection",
                  previous: oldTotal?.projection,
                },
                {
                  title: "Total faturado líquido",
                  value: total.billed,
                  base: total.projection,
                  note: "da projeção realizada",
                  icon: CheckCircle2,
                  tone: "billed",
                  previous: oldTotal?.billed,
                },
                {
                  title: "A faturar",
                  value: total.pending,
                  base: total.projection,
                  note: "da projeção a realizar",
                  icon: Clock3,
                  tone: "pending",
                  previous: oldTotal?.pending,
                },
                {
                  title: "Meta de faturamento",
                  value: target,
                  ratio: total.billed,
                  base: target,
                  note: "da meta faturada",
                  icon: Target,
                  tone: "target",
                  previous: previousTarget,
                },
                {
                  title: "A buscar da meta",
                  value:
                    target == null
                      ? null
                      : Math.max(0, target - total.projection),
                  base: target,
                  note: "da meta a conquistar",
                  icon: ArrowUpRight,
                  tone: "gap",
                  previous:
                    previousTarget != null && oldTotal
                      ? Math.max(0, previousTarget - oldTotal.projection)
                      : null,
                },
                {
                  title: "Contratos pendentes",
                  value: total.contractPending,
                  base: total.pending,
                  note: "do valor a faturar",
                  icon: FileText,
                  tone: "contracts",
                  previous: oldTotal?.contractPending,
                },
              ].map((card) => {
                const Icon = card.icon;
                const delta =
                  typeof card.value === "number" &&
                  typeof card.previous === "number"
                    ? (Math.round(card.value * 100) -
                        Math.round(card.previous * 100)) /
                      100
                    : null;
                const decreaseIsGood =
                  card.tone === "pending" || card.tone === "gap" || card.tone === "contracts";
                const positiveChange =
                  delta !== null &&
                  delta !== 0 &&
                  (decreaseIsGood ? delta < 0 : delta > 0);
                const Direction =
                  delta === null || delta === 0
                    ? Minus
                    : delta > 0
                      ? ArrowUp
                      : ArrowDown;
                const ratio = card.ratio ?? card.value;
                const hasRatio =
                  typeof ratio === "number" &&
                  typeof card.base === "number" &&
                  card.base > 0;
                const destination = card.tone === "contracts"
                  ? `/comercial/contratos?period=${period}&company=${company}&filter=pending`
                  : card.tone === "pending" || card.tone === "billed"
                    ? `/comercial/vendas?period=${period}&company=${company}&status=${card.tone === "pending" ? "Pendente" : "Processado"}`
                    : null;
                const destinationLabel = card.tone === "contracts" ? "Ver contratos pendentes" : card.tone === "pending" ? "Ver vendas pendentes" : "Ver vendas faturadas";
                return (
                  <article
                    key={card.tone}
                    className={`cm-kpi cm-kpi-${card.tone}${destination ? " cm-kpi-clickable" : ""}`}
                  >
                    {destination && <Link className="cm-kpi-link" href={destination} aria-label={destinationLabel}/>}
                    <div className="cm-kpi-heading">
                      <span>{card.title}</span>
                      <span className="cm-kpi-icon">
                        <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                      </span>
                    </div>
                    <div className="cm-kpi-value-row">
                      <strong className="cm-kpi-value">
                        {typeof card.value === "number" ? (
                          <>
                            <span>R$</span>{" "}
                            {card.value.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </>
                        ) : (
                          "—"
                        )}
                      </strong>
                      {card.tone !== "target" && (
                        <div
                          className="cm-kpi-variation"
                          title={
                            snapshot
                              ? `Comparação com ${snapshot.label} · ${date(snapshot.created_at)}`
                              : "Registre uma parcial para comparar"
                          }
                        >
                          {delta !== null ? (
                            <>
                              <span className="cm-variation-value">
                                <Direction
                                  size={17}
                                  className={
                                    delta === 0
                                      ? ""
                                      : positiveChange
                                        ? "cm-arrow-good"
                                        : "cm-arrow-bad"
                                  }
                                  aria-hidden="true"
                                />
                                {delta === 0
                                  ? "Sem variação"
                                  : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}`}
                              </span>
                              <small>em relação à parcial de referência</small>
                            </>
                          ) : (
                            <small>
                              {selected && !snapshot
                                ? "Carregando comparação…"
                                : "Sem base para comparação"}
                            </small>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="cm-kpi-footer">
                      <p>
                        {hasRatio ? (
                          <>
                            <b>{pct(ratio!, card.base!)}</b> {card.note}
                          </>
                        ) : card.base == null ? (
                          "Meta definida apenas para o grupo"
                        ) : (
                          "Sem base para calcular o percentual"
                        )}
                      </p>
                      {hasRatio && (
                        <div className="cm-meter" aria-hidden="true">
                          <i
                            style={{
                              width: `${Math.max(0, Math.min(100, (ratio! / card.base!) * 100))}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
            {
              <>
                <section className="sp-panel cm-panel">
                  <h2>Vendas pendentes por responsável do fluxo</h2>
                  <div className="cm-owner-grid">
                    {[...new Set([...owners.keys(), ...previousOwners.keys()])]
                      .sort(
                        (a, b) => (owners.get(b) || 0) - (owners.get(a) || 0),
                      )
                      .map((name) => {
                        const cents = owners.get(name) || 0;
                        const delta =
                          (cents - (previousOwners.get(name) || 0)) / 100;
                        return (
                          <article key={name}>
                            <Link className="cm-kpi-link" href={`/comercial/vendas?${new URLSearchParams({period,company,status:"Pendente",flowOwner:name === "Sem responsável" ? "" : name})}`} aria-label={`Ver vendas pendentes · ${name}`}/>
                            <span>{name}</span>
                            <div className="cm-owner-value-row">
                              <strong>{money(cents / 100)}</strong>
                              {snapshot && (
                                <span className="cm-owner-variation">
                                  {delta === 0 ? <Minus size={14} aria-hidden="true"/> : delta > 0 ? <ArrowUp size={14} className="cm-arrow-bad" aria-hidden="true"/> : <ArrowDown size={14} className="cm-arrow-good" aria-hidden="true"/>}
                                  {delta === 0 ? "Sem variação" : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}`}
                                </span>
                              )}
                            </div>
                            {snapshot && <small>Em relação à parcial · {money((previousOwners.get(name) || 0) / 100)}</small>}
                            <small>
                              {pct(cents / 100, total.salesPending)} das vendas
                              pendentes
                            </small>
                            <div className="cm-meter" aria-hidden="true">
                              <i
                                style={{
                                  width: `${total.salesPending > 0 ? Math.max(0, Math.min(100, (cents / 100 / total.salesPending) * 100)) : 0}%`,
                                }}
                              />
                            </div>
                          </article>
                        );
                      })}
                  </div>
                  <p>
                    Total de vendas pendentes:{" "}
                    <strong>{money(total.salesPending)}</strong>
                  </p>
                </section>
                <section className="sp-panel cm-panel">
                  <h2>Resultado por empresa</h2>
                  <div className="sp-table-scroll">
                    <table className="sp-table">
                      <thead>
                        <tr>
                          <th>Empresa</th>
                          <th>Projeção</th>
                          <th>Faturado líquido</th>
                          <th>A faturar</th>
                          <th>Contratos pendentes</th>
                          <th>Realizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.company}>
                            <th>{r.name}</th>
                            <td>{money(r.projection)}</td>
                            <td>{money(r.billed)}</td>
                            <td>{money(r.pending)}</td>
                            <td>{money(r.contractPending)}</td>
                            <td>{pct(r.billed, r.projection)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            }
            {snapshot && oldTotal ? (
              <>
                <section className="sp-panel cm-panel">
                  <h2>
                    Movimentações desde {snapshot.label} ·{" "}
                    {date(snapshot.created_at)}
                  </h2>
                  <p>
                    Projeção da parcial:{" "}
                    <strong>{money(oldTotal.projection)}</strong> → Atual:{" "}
                    <strong>{money(total.projection)}</strong> · Variação:{" "}
                    <strong>
                      {money(total.projection - oldTotal.projection)}
                    </strong>
                  </p>
                  <p>
                    Faturado líquido: {money(oldTotal.billed)} →{" "}
                    {money(total.billed)} · A faturar: {money(oldTotal.pending)}{" "}
                    → {money(total.pending)}
                  </p>
                  <p className="sp-footnote">
                    Entradas e saídas indicam presença nesta competência. Não
                    comprovam cancelamento ou mudança de mês. OS faturadas são
                    alterações de situação. Os valores de documentos não devem
                    ser somados: notas, contratos e OS têm compensações no
                    cálculo da projeção.
                  </p>
                </section>
                <section className="cm-change-filters">
                  <label>
                    Movimentação
                    <select
                      aria-label="Movimentação"
                      value={changeType}
                      onChange={(e) => setChangeType(e.target.value)}
                    >
                      <option value="all">Todas ({changes.length})</option>
                      {["Entrada", "Saída", "Alteração"].map((t) => (
                        <option key={t} value={t}>
                          {t} ({changes.filter((c) => c.type === t).length})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Pesquisar cliente ou documento
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </section>
                <div className="sp-panel sp-table-scroll">
                  <table className="sp-table cm-changes">
                    <thead>
                      <tr>
                        <th>Movimento</th>
                        <th>Empresa / documento</th>
                        <th>Cliente / Equipamento</th>
                        <th>Na parcial</th>
                        <th>Atual</th>
                        <th>O que mudou</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((c) => {
                        const d = c.after || c.before!;
                        return (
                          <tr key={c.key}>
                            <th>
                              <span
                                className={`cm-change cm-${c.type === "Entrada" ? "in" : c.type === "Saída" ? "out" : "edit"}`}
                              >
                                {c.type}
                              </span>
                            </th>
                            <td>
                              {
                                companies.find((co) => co.id === d.company)
                                  ?.name
                              }
                              <br />
                              {kindName(d)} · {d.id}
                            </td>
                            <td>
                              {d.name}
                              {d.fields?.equipment && (
                                <small className="cm-client-equipment">
                                  {String(d.fields.equipment)}
                                </small>
                              )}
                            </td>
                            {[c.before, c.after].map((v, i) => (
                              <td key={i}>
                                {v ? (
                                  <>
                                    <strong>{money(v.amount)}</strong>
                                    <small>
                                      {kindName(v)} · {v.date}
                                    </small>
                                    <small>
                                      {String(v.fields?.flowOwner || "")} ·{" "}
                                      {String(v.fields?.flowStatus || "")}
                                    </small>
                                    {v.fields?.expected && (
                                      <small>
                                        Entrega: {String(v.fields.expected)}
                                      </small>
                                    )}
                                    {v.fields?.seller && (
                                      <small>
                                        Vendedor: {String(v.fields.seller)}
                                      </small>
                                    )}
                                    {v.kind === "contracts" && (
                                      <small>
                                        Faturado:{" "}
                                        {money(Number(v.fields?.billed || 0))} ·
                                        Saldo:{" "}
                                        {money(Number(v.fields?.pending || 0))}
                                      </small>
                                    )}
                                  </>
                                ) : (
                                  "Não consta"
                                )}
                              </td>
                            ))}
                            <td>{c.changes.join(" · ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!visible.length && (
                    <p className="sp-empty">
                      Nenhuma movimentação para os filtros selecionados.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="sp-notice">
                {selected
                  ? "Carregando parcial de referência…"
                  : "Registre a primeira parcial para começar a acompanhar entradas, saídas e alterações."}
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
