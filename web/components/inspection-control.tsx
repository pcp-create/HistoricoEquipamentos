"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SiteHeader from "./site-header";
import OrderSearchSelect from "./order-search-select";
import { brazilToday } from "@/lib/inspections/model";
import "./inspections.css";
const labels: Record<string, string> = {
  scheduled: "Em dia",
  soon: "Próximo do vencimento",
  due: "Vence hoje",
  overdue: "Vencida",
  incomplete: "Sem data",
};
const day = (s: string) =>
  s ? s.split("-").reverse().join("/") : "Não registrada";
export default function InspectionControl() {
  const params = useSearchParams(),
    reportId = params.get("report") || "",
    initialPlan = params.get("plan") || "";
  const [data, setData] = useState<any>({
      plans: [],
      types: [],
      records: [],
      quotes: [],
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [route, setRoute] = useState("");
  const [selected, setSelected] = useState(initialPlan),
    [form, setForm] = useState<any>(null),
    [newType, setNewType] = useState(false),
    [typeName, setTypeName] = useState(""),
    [record, setRecord] = useState<any>(null);
  const dataRequest = useRef(0);
  const quoteRequest = useRef<Record<string, string>>({});
  async function load() {
    const request = ++dataRequest.current;
    const p = new URLSearchParams();
    if (selected) p.set("plan", selected);
    if (reportId) p.set("report", reportId);
    const r = await fetch("/api/inspections?" + p, { cache: "no-store" }),
      b = await r.json();
    if (!r.ok) throw Error(b.error);
    if (request === dataRequest.current) setData(b);
    return b;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, reportId]);
  async function save(body: any) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/inspections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);
      if (b.quote) {
        location.assign("/orcamentos/novo?id=" + b.quote.id);
        return;
      }
      setForm(null);
      setRecord(null);
      setNewType(false);
      setTypeName("");
      setMessage("Inspeção salva. Vencimentos e tarefas atualizados.");
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(p?: any) {
    const ctx = data.report;
    setError("");
    setForm(
      p
        ? {
            id: p.id,
            version: p.version,
            customer: p.customer_person_id,
            customerName: p.customer,
            typeId: p.type_id,
            route: p.route_name,
            interval: p.interval_value,
            unit: p.interval_unit,
            noticeDays: p.notice_days,
            lastDate: p.baseline_date || "",
            firstDue: p.first_due || "",
            notes: p.notes,
            active: p.active,
          }
        : {
            id: crypto.randomUUID(),
            customer: ctx?.customer_person_id || "",
            customerName: ctx?.document?.customer?.name || "",
            typeId: ctx
              ? data.types.find((t: any) => t.code === "vibration")?.id || ""
              : data.types[0]?.id || "",
            route: "",
            interval: 1,
            unit: "months",
            noticeDays: 30,
            lastDate: ctx?.collectedOn || "",
            firstDue: "",
            notes: "",
            active: true,
          },
    );
  }
  const listed = data.plans.filter(
    (p: any) =>
      (!query ||
        [p.customer, p.route_name, p.city, p.type_name]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      (!type || p.type_id === type) &&
      (!route || p.route_name === route) &&
      (!status ||
        (status === "inactive"
          ? !p.active
          : p.active && p.forecast.status === status)),
  );
  const detail = data.plans.find((p: any) => p.id === selected);
  const reportPlans = data.report
    ? data.plans.filter(
        (p: any) =>
          p.customer_person_id === data.report.customer_person_id &&
          p.type_code === "vibration",
      )
    : [];
  return (
    <div className="inspection-page">
      <SiteHeader active="equipmentInspections" />
      <main>
        <nav className="inspection-navigation" aria-label="Controles">
          <Link href="/equipamentos/preventivas">Controle de Manutenções</Link>
          <Link href="/equipamentos/inspecoes" aria-current="page">
            Controle de Inspeções
          </Link>
        </nav>
        <header>
          <div>
            <h1>Controle de Inspeções</h1>
            <p>
              Rotas e periodicidades por cliente, abrangendo todo o parque de
              máquinas.
            </p>
          </div>
          <div className="inspection-actions">
            <button disabled={busy || loading} onClick={() => open()}>
              Criar plano de inspeção
            </button>
            <button disabled={busy || loading} onClick={() => setNewType(true)}>
              Cadastrar tipo de inspeção
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="inspection-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {loading && <p role="status">Carregando inspeções…</p>}
        {data.report && (
          <section className="inspection-panel">
            <h2>Coleta do relatório de vibração</h2>
            <p>
              {data.report.document?.customer?.name} · Coleta:{" "}
              {day(data.report.collectedOn)}
            </p>
            <p>
              Vincule a coleta ao plano do cliente. O histórico recalcula o
              próximo vencimento e encerra a tarefa do ciclo anterior.
            </p>
            {reportPlans.map((p: any) => (
              <div key={p.id} className="inspection-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    save({
                      action: "record",
                      id: crypto.randomUUID(),
                      planId: p.id,
                      reportId,
                    })
                  }
                >
                  Registrar coleta no plano: {p.type_name}
                </button>
                <button onClick={() => setSelected(p.id)}>
                  Ir ao plano de inspeção
                </button>
              </div>
            ))}
            {!reportPlans.length && (
              <button disabled={busy} onClick={() => open()}>
                Criar plano com esta coleta
              </button>
            )}
          </section>
        )}
        <section className="inspection-filters">
          <label>
            Pesquisar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cliente, rota ou cidade"
            />
          </label>
          <label>
            Tipo de inspeção
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos</option>
              {data.types.map((t: any) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rota
            <select value={route} onChange={(e) => setRoute(e.target.value)}>
              <option value="">Todas</option>
              {Array.from(
                new Set<string>(
                  data.plans.map((p: any) => p.route_name).filter(Boolean),
                ),
              ).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(labels).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
              <option value="inactive">Inativos</option>
            </select>
          </label>
        </section>
        <div className="inspection-table">
          <table>
            <thead>
              <tr>
                {[
                  "Cliente / rota",
                  "Tipo / periodicidade",
                  "Máquinas",
                  "Última inspeção",
                  "Próxima inspeção",
                  "Situação",
                  "Ações",
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.customer}</strong>
                    <small>
                      {p.route_name || "Sem rota"} · {p.city}/{p.uf}
                    </small>
                  </td>
                  <td>
                    {p.type_name}
                    <small>
                      A cada {p.interval_value}{" "}
                      {p.interval_unit === "months" ? "meses" : "dias"}
                    </small>
                  </td>
                  <td>{p.equipment_count}</td>
                  <td>{day(p.forecast.lastDate)}</td>
                  <td>{day(p.forecast.due)}</td>
                  <td>
                    <span className={"inspection-status " + p.forecast.status}>
                      {p.active ? labels[p.forecast.status] : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div className="inspection-actions">
                      <button onClick={() => setSelected(p.id)}>
                        Abrir plano
                      </button>
                      <button onClick={() => open(p)}>Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !listed.length && (
            <p>Nenhum plano nos filtros selecionados.</p>
          )}
        </div>
        {detail && (
          <section className="inspection-panel" aria-label="Plano de inspeção">
            <div className="inspection-actions">
              <h2>
                {detail.type_name} · {detail.customer}
              </h2>
              <button onClick={() => setSelected("")}>Fechar plano</button>
            </div>
            <p>
              {detail.equipment_count} máquinas do cliente · {detail.notes}
            </p>
            <div className="inspection-actions">
              <button
                disabled={busy}
                onClick={() =>
                  setRecord({
                    id: crypto.randomUUID(),
                    planId: detail.id,
                    collectedOn: brazilToday(),
                    serviceOrder: "",
                    notes: "",
                  })
                }
              >
                Registrar inspeção realizada
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  quoteRequest.current[detail.id] ??= crypto.randomUUID();
                  void save({
                    action: "quote",
                    planId: detail.id,
                    requestId: quoteRequest.current[detail.id],
                  });
                }}
              >
                Gerar orçamento
              </button>
              <Link href={"/tarefas?inspection=" + detail.id}>
                Ver tarefas da inspeção
              </Link>
            </div>
            <p>
              O orçamento abre como rascunho com o cliente e a última coleta.
              Inclua os serviços e valores antes de enviar.
            </p>
            <h3>Inspeções realizadas</h3>
            {data.records.map((r: any) => (
              <article key={r.id}>
                <strong>{day(r.collected_on)}</strong>
                <p>
                  {r.notes} {r.service_order && " · OS " + r.service_order}
                </p>
                {r.report_id && (
                  <Link href={"/analise-vibracao?report=" + r.report_id}>
                    Abrir relatório de vibração
                  </Link>
                )}
              </article>
            ))}
            {!data.records.length && <p>Nenhuma execução vinculada.</p>}
            <h3>Orçamentos vinculados</h3>
            {data.quotes.map((q: any) => (
              <p key={q.quote_id}>
                <Link href={"/orcamentos/novo?id=" + q.quote_id}>
                  Abrir orçamento {q.number}
                </Link>
              </p>
            ))}
          </section>
        )}
        {form && (
          <div className="inspection-overlay">
            <form
              className="inspection-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Plano de inspeção"
              onSubmit={(e) => {
                e.preventDefault();
                void save({
                  ...form,
                  action: "save",
                  reportId: !form.version ? reportId || undefined : undefined,
                });
              }}
            >
              <h2>
                {form.version ? "Editar plano" : "Criar plano de inspeção"}
              </h2>
              {error && (
                <p role="alert" className="inspection-error">
                  {error}
                </p>
              )}
              {form.version || data.report ? (
                <p>
                  Cliente: <strong>{form.customerName}</strong>
                </p>
              ) : (
                <OrderSearchSelect
                  label="Cliente"
                  value={form.customer}
                  placeholder="Pesquise o cliente"
                  endpoint="/api/inspections?customers=1"
                  selectedLabel={form.customerName}
                  onChange={(c) =>
                    setForm({ ...form, customer: c.id, customerName: c.name })
                  }
                />
              )}
              <div className="inspection-form-grid">
                <label>
                  Tipo de inspeção
                  <select
                    required
                    disabled={!!form.version || !!data.report}
                    value={form.typeId}
                    onChange={(e) =>
                      setForm({ ...form, typeId: e.target.value })
                    }
                  >
                    <option value="">Selecione</option>
                    {data.types.map((t: any) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome da rota
                  <input
                    maxLength={160}
                    value={form.route}
                    onChange={(e) =>
                      setForm({ ...form, route: e.target.value })
                    }
                  />
                </label>
                <label>
                  Periodicidade
                  <input
                    required
                    type="number"
                    min={1}
                    max={form.unit === "months" ? 120 : 3650}
                    value={form.interval}
                    onChange={(e) =>
                      setForm({ ...form, interval: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Unidade
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  >
                    <option value="months">Meses</option>
                    <option value="days">Dias</option>
                  </select>
                </label>
                <label>
                  Próximo do vencimento: antecedência em dias
                  <input
                    required
                    type="number"
                    min={0}
                    max={365}
                    value={form.noticeDays}
                    onChange={(e) =>
                      setForm({ ...form, noticeDays: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Última inspeção
                  <input
                    type="date"
                    readOnly={!!data.report && !form.version}
                    max={brazilToday()}
                    value={form.lastDate}
                    onChange={(e) =>
                      setForm({ ...form, lastDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Primeira inspeção (se não houver histórico)
                  <input
                    type="date"
                    value={form.firstDue}
                    onChange={(e) =>
                      setForm({ ...form, firstDue: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Observações
                <textarea
                  maxLength={5000}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              {form.version && (
                <label>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) =>
                      setForm({ ...form, active: e.target.checked })
                    }
                  />
                  Plano ativo
                </label>
              )}
              <p>
                O plano abrange todas as máquinas do cliente. Sem última
                inspeção, informe a data da primeira inspeção. A periodicidade
                será aplicada após cada execução.
              </p>
              <div className="inspection-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setForm(null)}
                >
                  Cancelar
                </button>
                <button disabled={busy || !form.customer}>Salvar plano</button>
              </div>
            </form>
          </div>
        )}
        {record && (
          <div className="inspection-overlay">
            <form
              className="inspection-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Registrar inspeção"
              onSubmit={(e) => {
                e.preventDefault();
                void save({ ...record, action: "record" });
              }}
            >
              <h2>Registrar inspeção realizada</h2>
              {error && <p role="alert">{error}</p>}
              <label>
                Data da coleta / inspeção
                <input
                  required
                  type="date"
                  max={brazilToday()}
                  value={record.collectedOn}
                  onChange={(e) =>
                    setRecord({ ...record, collectedOn: e.target.value })
                  }
                />
              </label>
              <label>
                Ordem de serviço
                <input
                  maxLength={100}
                  value={record.serviceOrder}
                  onChange={(e) =>
                    setRecord({ ...record, serviceOrder: e.target.value })
                  }
                />
              </label>
              <label>
                Registro da inspeção
                <textarea
                  maxLength={5000}
                  value={record.notes}
                  onChange={(e) =>
                    setRecord({ ...record, notes: e.target.value })
                  }
                />
              </label>
              <div className="inspection-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRecord(null)}
                >
                  Cancelar
                </button>
                <button disabled={busy}>Salvar inspeção</button>
              </div>
            </form>
          </div>
        )}
        {newType && (
          <div className="inspection-overlay">
            <form
              className="inspection-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Tipo de inspeção"
              onSubmit={(e) => {
                e.preventDefault();
                void save({ action: "type", name: typeName });
              }}
            >
              <h2>Cadastrar tipo de inspeção</h2>
              {error && <p role="alert">{error}</p>}
              <label>
                Nome do tipo
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                />
              </label>
              <div className="inspection-actions">
                <button type="button" onClick={() => setNewType(false)}>
                  Cancelar
                </button>
                <button disabled={busy}>Salvar tipo</button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
