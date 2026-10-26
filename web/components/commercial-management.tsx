"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Printer, RefreshCw, TrendingUp, CheckCircle2, Clock3, Target, ArrowUpRight, FileText } from "lucide-react";
import ProjectionSyncButton from "./projection-sync-button";
import SiteHeader from "./site-header";
import CommercialPeriodFilter from "./commercial-period-filter";
import type { ProjectionData } from "@/lib/sales-projection/store";
import { companies, sumRows, type Detail } from "@/lib/sales-projection/model";
import { compareProjection } from "@/lib/sales-projection/comparison";
import "./sales-projection.css";
import "./commercial-management.css";

type Snapshot = { id: string; label: string; period: string; created_at: string; created_by: string; document: ProjectionData };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number, total: number) => total > 0 ? (value / total).toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 }) : "—";
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const kindName = (d: Detail) => ({ salesPending: "OS pendente", salesBilled: "OS faturada", contracts: "Contrato", contractBilled: "Faturamento de contrato", invoices: "Nota de venda", returns: "Devolução" }[d.kind] || d.kind);
async function request(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar os dados.");
  return data;
}
export default function CommercialManagement({ mode }: { mode: "summary" | "changes" }) {
  const [period, setPeriod] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7));
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
    setBusy(true); setError(""); setLive(null); setSnapshot(null); setList([]);
    Promise.all([
      request("/api/sales-projection?period=" + period),
      request("/api/sales-projection/snapshots?period=" + period),
    ]).then(([data, partials]) => {
      if (!active) return;
      setLive(data); setList(partials.rows);
      setSelected((id) => partials.rows.some((s: Snapshot) => s.id === id) ? id : partials.rows[0]?.id || "");
    }).catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [period, refresh]);
  useEffect(() => {
    let active = true;
    setSnapshot(null);
    if (selected) request(`/api/sales-projection/snapshots?period=${period}&id=${selected}`)
      .then((s) => { if (active) setSnapshot(s); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selected, period, refresh]);
  const data = frozen && mode === "summary" ? snapshot?.document : live;
  const rows = data?.rows.filter((r) => company === "all" || String(r.company) === company) || [];
  const total = rows.length ? sumRows(rows) : null;
  const oldRows = snapshot?.document.rows.filter((r) => company === "all" || String(r.company) === company) || [];
  const oldTotal = oldRows.length ? sumRows(oldRows) : null;
  const scoped = (details: Detail[]) => details.filter((d) => company === "all" || String(d.company) === company);
  const changes = useMemo(() => snapshot && live ? compareProjection(scoped(snapshot.document.details), scoped(live.details)) : [], [snapshot, live, company]);
  const visible = changes.filter((c) => (changeType === "all" || c.type === changeType) && `${c.before?.name || c.after?.name} ${c.before?.id || c.after?.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const owners = new Map<string, number>();
  for (const d of scoped(data?.details || [])) if (d.kind === "salesPending") {
    const name = String(d.fields?.flowOwner || "Sem responsável");
    owners.set(name, (owners.get(name) || 0) + Math.round(d.amount * 100));
  }
  async function capture() {
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    try {
      const saved = await request("/api/sales-projection/snapshots", { id, period, label });
      setSelected(saved.id); setFrozen(true);
      setNotice("Parcial registrada. O resumo congelado está disponível para impressão.");
      setRequestId(null); setRefresh((n) => n + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(period + "-01T12:00:00Z"));
  const periodLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1) + "/" + period.slice(0, 4);
  const target = company === "all" ? data?.target : null;
  return <>
    <SiteHeader active="salesProjection" />
    <main className="sales-projection cm-page">
      <nav className="cm-nav"><Link href="/comercial/projecao">← Projeção</Link><Link href="/comercial/resumo">Resumo gerencial</Link><Link href="/comercial/parciais">Movimentações das parciais</Link></nav>
      <div className="sp-heading"><div><span className="eyebrow">COMERCIAL / GESTÃO</span><h1>{mode === "summary" ? "Resumo gerencial" : "Movimentações da projeção"}</h1><p>{mode === "summary" ? "Indicadores para a parcial da gestão." : "Compare a base atual com a última parcial ou outra fotografia da mesma competência."}</p></div>
        <div className="sp-actions"><ProjectionSyncButton onComplete={() => setRefresh((n) => n + 1)} /><button className="button" onClick={() => window.print()} disabled={!total || busy}><Printer size={16}/> Imprimir / PDF</button><button className="button" onClick={() => setRefresh((n) => n + 1)} disabled={busy || saving}><RefreshCw size={16}/> Atualizar</button></div></div>
      <div className="cm-controls">
        <CommercialPeriodFilter period={period} company={company} onPeriodChange={(value) => { setPeriod(value); setSelected(""); setFrozen(false); setRequestId(null); setNotice(""); }} onCompanyChange={setCompany} companies={companies.map((c) => ({ company: c.id, name: c.name }))}/>
        <section className="cm-toolbar">
          <label>Parcial de referência<select aria-label="Parcial de referência" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={saving}>{!list.length && <option value="">Nenhuma parcial registrada</option>}{list.map((s) => <option key={s.id} value={s.id}>{date(s.created_at)} · {s.label}</option>)}</select></label>
          {mode === "summary" && <label>Visualização<select aria-label="Visualização" value={frozen ? "snapshot" : "live"} onChange={(e) => setFrozen(e.target.value === "snapshot")}><option value="live">Projeção atual</option><option value="snapshot" disabled={!selected}>Parcial congelada</option></select></label>}
          <label>Nome da nova parcial<input value={label} maxLength={120} disabled={saving} onChange={(e) => { setLabel(e.target.value); setRequestId(null); }}/></label>
          <button className="button primary" onClick={capture} disabled={saving || busy || !live?.complete || !label.trim()}><Camera size={16}/> {saving ? "Registrando…" : "Registrar parcial agora"}</button>
        </section>
        <p className="sp-footnote">O registro congela as três empresas e a meta desta competência com os dados integrados no momento. Use “Registrar parcial agora” antes do envio de sexta-feira, às 12h (Brasília). Não há envio automático.</p>
      </div>
      {error && <p role="alert" className="sp-notice">{error}</p>}
      {notice && <p role="status" className="sp-notice">{notice}</p>}
      {busy && <p role="status">Carregando informações…</p>}
      {live && !live.complete && <p role="alert" className="sp-notice">Integração incompleta. O registro de parciais está bloqueado até a base ficar completa.</p>}
      {data && total && !busy && <>
        <div className="cm-stamp"><strong>{period.split("-").reverse().join("/")} · {company === "all" ? "Grupo RJ — todas as empresas" : rows[0]?.name}</strong><span>{frozen && mode === "summary" && snapshot ? `Parcial: ${date(snapshot.created_at)} · ${snapshot.created_by}` : `Base integrada: ${data.updatedAt ? date(data.updatedAt) : "sem data"}`}</span></div>
        <section className="cm-kpis">
          {[
            { title: `Projeção · ${periodLabel}`, value: total.projection, base: target, note: "da meta projetada", icon: TrendingUp, tone: "projection" },
            { title: "Total faturado líquido", value: total.billed, base: total.projection, note: "da projeção realizada", icon: CheckCircle2, tone: "billed" },
            { title: "A faturar", value: total.pending, base: total.projection, note: "da projeção a realizar", icon: Clock3, tone: "pending" },
            { title: "Meta de faturamento", value: target, ratio: total.billed, base: target, note: "da meta faturada", icon: Target, tone: "target" },
            { title: "A buscar da meta", value: target == null ? null : Math.max(0, target - total.projection), base: target, note: "da meta a conquistar", icon: ArrowUpRight, tone: "gap" },
            { title: "Contratos pendentes", value: total.contractPending, base: total.pending, note: "do valor a faturar", icon: FileText, tone: "contracts" },
          ].map((card) => {
            const Icon = card.icon;
            const ratio = card.ratio ?? card.value;
            const hasRatio = typeof ratio === "number" && typeof card.base === "number" && card.base > 0;
            return <article key={card.tone} className={`cm-kpi cm-kpi-${card.tone}`}>
              <div className="cm-kpi-heading"><span>{card.title}</span><span className="cm-kpi-icon"><Icon size={21} strokeWidth={1.7} aria-hidden="true"/></span></div>
              <strong className="cm-kpi-value">{typeof card.value === "number" ? <><span>R$</span> {card.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</> : "—"}</strong>
              <div className="cm-kpi-footer">
                <p>{hasRatio ? <><b>{pct(ratio!, card.base!)}</b> {card.note}</> : card.base == null ? "Meta definida apenas para o grupo" : "Sem base para calcular o percentual"}</p>
                {hasRatio && <div className="cm-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, ratio! / card.base! * 100))}%` }}/></div>}
              </div>
            </article>;
          })}
        </section>
        {mode === "summary" ? <>
          <section className="sp-panel cm-panel"><h2>Vendas pendentes por responsável do fluxo</h2><div className="cm-owner-grid">{[...owners.entries()].sort((a,b) => b[1]-a[1]).map(([name, cents]) => <article key={name}><span>{name}</span><strong>{money(cents / 100)}</strong><small>{pct(cents / 100, total.salesPending)} das vendas pendentes</small><div className="cm-meter" aria-hidden="true"><i style={{ width: `${total.salesPending > 0 ? Math.max(0, Math.min(100, cents / 100 / total.salesPending * 100)) : 0}%` }}/></div></article>)}</div><p>Total de vendas pendentes: <strong>{money(total.salesPending)}</strong></p></section>
          <section className="sp-panel cm-panel"><h2>Resultado por empresa</h2><div className="sp-table-scroll"><table className="sp-table"><thead><tr><th>Empresa</th><th>Projeção</th><th>Faturado líquido</th><th>A faturar</th><th>Contratos pendentes</th><th>Realizado</th></tr></thead><tbody>{rows.map((r) => <tr key={r.company}><th>{r.name}</th><td>{money(r.projection)}</td><td>{money(r.billed)}</td><td>{money(r.pending)}</td><td>{money(r.contractPending)}</td><td>{pct(r.billed,r.projection)}</td></tr>)}</tbody></table></div></section>
        </> : snapshot && oldTotal ? <>
          <section className="sp-panel cm-panel"><h2>Desde {snapshot.label} · {date(snapshot.created_at)}</h2><p>Projeção da parcial: <strong>{money(oldTotal.projection)}</strong> → Atual: <strong>{money(total.projection)}</strong> · Variação: <strong>{money(total.projection-oldTotal.projection)}</strong></p><p>Faturado líquido: {money(oldTotal.billed)} → {money(total.billed)} · A faturar: {money(oldTotal.pending)} → {money(total.pending)}</p><p className="sp-footnote">Entradas e saídas indicam presença nesta competência. Não comprovam cancelamento ou mudança de mês. OS faturadas são alterações de situação. Os valores de documentos não devem ser somados: notas, contratos e OS têm compensações no cálculo da projeção.</p></section>
          <section className="cm-change-filters"><label>Movimentação<select aria-label="Movimentação" value={changeType} onChange={(e) => setChangeType(e.target.value)}><option value="all">Todas ({changes.length})</option>{["Entrada","Saída","Alteração"].map((t) => <option key={t} value={t}>{t} ({changes.filter((c) => c.type === t).length})</option>)}</select></label><label>Pesquisar cliente ou documento<input value={search} onChange={(e) => setSearch(e.target.value)}/></label></section>
          <div className="sp-panel sp-table-scroll"><table className="sp-table cm-changes"><thead><tr><th>Movimento</th><th>Empresa / documento</th><th>Cliente</th><th>Na parcial</th><th>Atual</th><th>O que mudou</th></tr></thead><tbody>{visible.map((c) => {
            const d = c.after || c.before!;
            return <tr key={c.key}><th><span className={`cm-change cm-${c.type === "Entrada" ? "in" : c.type === "Saída" ? "out" : "edit"}`}>{c.type}</span></th><td>{companies.find((co) => co.id === d.company)?.name}<br/>{kindName(d)} · {d.id}</td><td>{d.name}</td>{[c.before,c.after].map((v,i) => <td key={i}>{v ? <><strong>{money(v.amount)}</strong><small>{kindName(v)} · {v.date}</small><small>{String(v.fields?.flowOwner || "")} · {String(v.fields?.flowStatus || "")}</small>{v.fields?.expected && <small>Entrega: {String(v.fields.expected)}</small>}{v.fields?.seller && <small>Vendedor: {String(v.fields.seller)}</small>}{v.kind === "contracts" && <small>Faturado: {money(Number(v.fields?.billed || 0))} · Saldo: {money(Number(v.fields?.pending || 0))}</small>}</> : "Não consta"}</td>)}<td>{c.changes.join(" · ")}</td></tr>;
          })}</tbody></table>{!visible.length && <p className="sp-empty">Nenhuma movimentação para os filtros selecionados.</p>}</div>
        </> : <p className="sp-notice">{selected ? "Carregando parcial de referência…" : "Registre a primeira parcial para começar a acompanhar entradas, saídas e alterações."}</p>}
      </>}
    </main>
  </>;
}
