"use client";
import SchedulePauseReasons from "./schedule-pause-reasons";
import SaveActionIcon from "./save-action-icon";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Settings,
  ArrowLeft,
  ChevronRight,
  Trash2,
  ListChecks,
} from "lucide-react";
import SiteHeader from "./site-header";
import ScheduleAutomaticRules from "./schedule-automatic-rules";
import CompactNameTable from "./compact-name-table";
import ScheduleChecklistRun from "./schedule-checklist-run";
import ScheduleChecklistEditor from "./schedule-checklist-editor";
import ScheduleCalendarEditor from "./schedule-calendar-editor";
import ScheduleOrderButton from "./schedule-order-button";
import OrderDetailLink from "./order-detail-link";
import { apiFetch, clearApiCache } from "@/lib/client-api-cache";
import { companyName } from "@/lib/company-names";
import {
  blankOperation,
  planningStatus,
  statusNames,
  scheduleStatusNames,
  totalHours,
  validateSettings,
} from "@/lib/service-scheduling/model";
import { estimatedProfit } from "@/lib/order-profit";
import { isMaintenancePackage, maintenanceCost } from "@/lib/service-scheduling/service-costs";
import { sameUnit } from "@/lib/product-values";
import { isNotApproved } from "@/lib/material-approval";
import "./service-scheduling.css";
const itemIdentity = (i: any) => `${i.item_company ?? ""}:${i.item_order ?? ""}:${i.item_id ?? i.id_m8 ?? i.itemId}`;
const itemMatches = (a: any,b: any) => String(a.item_id ?? a.id_m8 ?? a.itemId) === String(b.item_id ?? b.id_m8 ?? b.itemId) && (a.item_company == null || b.item_company == null || (String(a.item_company)===String(b.item_company)&&String(a.item_order)===String(b.item_order)));
function ItemInconsistency({item}: {item:any}) {
  const issue = item.quantity_inconsistency;
  if (!issue) return null;
  return <small className="schedule-item-inconsistency">{issue.reason === "quantity" ? `Quantidade divergente: principal ${qty(issue.main)} · vinculada ${qty(issue.linked)}` : issue.reason === "unit" ? "Unidades diferentes ou ausentes nas OSs; confira as quantidades." : "Quantidade não informada em uma das OSs; confira o produto."}</small>;
}
const money = (v: any) =>
  v == null
    ? "Não informado"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (v: any) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const number = (s: string) => (s === "" ? null : Number(s));
const orderDate = (value: string | null | undefined) => {
  if (!value) return "Não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informada"
    : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const markup = (sale: any, cost: any) => {
  if (sale == null || cost == null || !Number.isFinite(Number(sale)) || !Number.isFinite(Number(cost)) || Number(cost) <= 0) return "—";
  return ((Number(sale) - Number(cost)) / Number(cost) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
};
const margin = (sale: any, cost: any) => {
  const p = cost == null ? null : estimatedProfit(sale, String(cost), "0");
  return p?.margin == null
    ? "—"
    : p.margin.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
};
async function request(body?: any, id?: string | null) {
  const r = await apiFetch(
    "/api/service-scheduling" + (!body && id ? "?id=" + id : ""),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
}
export default function ServiceScheduling() {
  const params = useSearchParams(),
    id = params.get("id");
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [config, setConfig] = useState(false),
    [tab, setTab] = useState("operations"),
    [query, setQuery] = useState("");
  async function load() {
    setError("");
    try {
      setData(await request(undefined, id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setData(null);
    void load();
  }, [id]);
  useEffect(() => {
    const refresh = () => { clearApiCache(); void load(); };
    window.addEventListener("order-link-updated", refresh);
    window.addEventListener("service-schedule-updated", refresh);
    return () => { window.removeEventListener("order-link-updated", refresh); window.removeEventListener("service-schedule-updated", refresh); };
  }, [id]);
  async function mutate(body: any) {
    if (busy) return false;
    const before = data;
    setBusy(true);
    setError("");
    if (body.action === "operation")
      setData({
        ...data,
        operations: data.operations.map((o: any) =>
          o.id === body.operationId
            ? {
                ...o,
                document: body.document,
                status: ["pending", "planning", "scheduled"].includes(o.status)
                  ? planningStatus(body.document)
                  : o.status,
              }
            : o,
        ),
      });
    if (body.action === "remove_operation")
      setData({
        ...data,
        operations: data.operations.filter(
          (o: any) => o.id !== body.operationId,
        ),
      });
    if (body.action === "add_operation")
      setData({
        ...data,
        operations: [
          ...data.operations,
          {
            id: "pending",
            position:
              Math.max(0, ...data.operations.map((o: any) => o.position)) + 1,
            document: blankOperation(),
            status: "pending",
            version: 1,
          },
        ],
      });
    if (body.action === "usage" || body.action === "service_cost") {
      const key = body.action === "usage" ? "usage" : "costs";
      setData({
        ...data,
        [key]: [
          ...data[key].filter((i: any) => !itemMatches(i, body)),
          { ...body, item_id: body.itemId },
        ],
      });
    }
    const transitions: Record<string, string> = {
      work_log: "executing",
      activity: "executing",
      finish_partial: "executing",
      finish_full: "awaiting_review",
      review: "reviewed",
      complete: "completed",
    };
    if (transitions[body.action])
      setData({
        ...data,
        operations: data.operations.map((o: any) =>
          o.id === body.operationId
            ? { ...o, status: transitions[body.action] }
            : o,
        ),
      });
    try {
      const result = await request({ ...body, scheduleId: id });
      if (result.operation)
        setData((d: any) => ({
          ...d,
          operations:
            body.action === "add_operation"
              ? [
                  ...d.operations.filter((o: any) => o.id !== "pending"),
                  result.operation,
                ]
              : d.operations.map((o: any) =>
                  o.id === result.operation.id ? result.operation : o,
                ),
        }));
      if (result.item) {
        const key = body.action === "usage" ? "usage" : "costs";
        setData((d: any) => ({
          ...d,
          [key]: [
            ...d[key].filter(
              (i: any) => !itemMatches(i, result.item),
            ),
            result.item,
          ],
        }));
      }
      if (transitions[body.action]) {
        const fresh = await request(undefined, id);
        setData(fresh);
      }
      return true;
    } catch (e) {
      setData(before);
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const materials = (data?.detail?.materials || []).filter(
      (m: any) => m.esta_excluido !== true && !isNotApproved(m.aprovado),
    ),
    services = (data?.detail?.services || []).filter(
      (s: any) => s.esta_excluido !== true,
    );
  const canUse =
    data?.canEditSettings ||
    data?.operations?.some(
      (o: any) =>
        o.status !== "completed" &&
        (o.document.responsible === data.email ||
          o.document.support.includes(data.email)),
    );
  return (
    <>
      <SiteHeader active="scheduling" />
      <main className="scheduling-page">
        <header className="scheduling-heading">
          <div>
            <h1>Programação de OSs</h1>
            <p>Operações, recursos, materiais e custos dos atendimentos.</p>
          </div>
          <div className="scheduling-actions">
            {id && (
              <a href="/programacao">
                <ArrowLeft size={16} />
                Todas as OSs
              </a>
            )}
            <button onClick={() => setConfig(!config)} aria-pressed={config}>
              <Settings size={17} />
              {config ? "Voltar" : "Configurações"}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                clearApiCache();
                void load();
              }}
            >
              Atualizar
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="scheduling-error">
            {error}
          </p>
        )}
        <span className="schedule-save-status" role="status">
          {busy ? "Salvando…" : ""}
        </span>
        {!data ? (
          <p>Carregando programação…</p>
        ) : config ? (
          <ScheduleSettings
            data={data}
            onSaved={(settings: any) => {
              setData({ ...data, settings });
              void load();
            }}
          />
        ) : !id ? (
          <>
            <ScheduleOverview schedules={data.schedules || []} />
            <label className="scheduling-search">
              Pesquisar OS, cliente ou equipamento
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <p>
              Use “Programar OS” nos detalhes da ordem no Histórico para
              incluí-la nesta lista.
            </p>
            <div className="scheduling-table scheduling-orders-list">
              <table>
                <thead>
                  <tr>
                    <th>N° OS</th>
                    <th>Operações</th>
                    <th>Cliente</th>
                    <th>Equipamento</th>
                    <th>Tipo / atendimento</th>
                    <th>Status do lançamento</th>
                    <th>Empresa</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(data.schedules || [])
                    .filter((s: any) =>
                      `${s.numero_sequencia || s.order_id} ${s.cliente_nome} ${s.equipamento}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          <span className="schedule-order-number">
                            <OrderDetailLink
                              id={String(s.order_id)}
                              company={s.company_id}
                              number={String(s.numero_sequencia || s.order_id)}
                            >
                              OS-
                              {String(
                                s.numero_sequencia || s.order_id,
                              ).padStart(5, "0")}
                            </OrderDetailLink>
                          </span>
                          <span
                            className={
                              "operation-status schedule-list-status " +
                              s.programming_status
                            }
                          >
                            {scheduleStatusNames[s.programming_status] ||
                              "Pendente"}
                          </span>
                        </td>
                        <td>
                          <span
                            className="material-count"
                            aria-label={`${s.operation_count} operações`}
                          >
                            <ListChecks size={13} aria-hidden="true" />
                            {s.operation_count}
                          </span>
                        </td>
                        <td>
                          {s.cliente_nome || "—"}
                          <small className="schedule-client-location">{[s.customer_city, s.customer_state].filter(Boolean).join(" / ") || "Cidade / estado não informados"}</small>
                        </td>
                        <td>{s.equipamento || "—"}</td>
                        <td>
                          <span>{s.tipo_nome || "—"}</span>
                          <small className="schedule-attendance-type">{s.tipo_atendimento_nome || "—"}</small>
                        </td>
                        <td>{s.status_lancamento_nome || "—"}
                          {s.linked_status_lancamento_nome && <small className="schedule-client-location" title={"OS vinculada: " + (s.linked_order_number || s.linked_order_id)}>{s.linked_status_lancamento_nome}</small>}
                        </td>
                        <td><span className="company-tag">{companyName(s.company_id)}</span></td>
                        <td className="schedule-details-cell">
                          <a href={"/programacao?id=" + s.id}>
                            Detalhes <ChevronRight size={14} />
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!data.schedules?.length && (
                <p>Nenhuma OS incluída na programação.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <section className="scheduling-order">
              <div className="scheduling-order-heading">
                <h2>
                  OS{" "}
                  {data.detail?.order?.numero_sequencia || data.schedule.order_id}{" "}
                  · {companyName(data.schedule.company_id)}
                </h2>
                <ScheduleOrderButton company={Number(data.schedule.company_id)} orderId={String(data.schedule.order_id)} />
              </div>
              <p className="schedule-client">
                {data.detail?.order?.cliente_nome || "Cliente não informado"}
              </p>
              <p className="schedule-customer-location">
                {[data.schedule.customer_city, data.schedule.customer_state].filter(Boolean).join(" / ") || "Cidade / estado não informados"}
              </p>
              <p>
                {data.detail?.order?.equipamento || "Equipamento não informado"}
              </p>
              <details className="schedule-observation" key={data.schedule.id}>
                <summary>
                  <span>Observação</span>
                  <span className="observation-expand">Expandir</span>
                  <span className="observation-collapse">Recolher</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </summary>
                <p>{data.detail?.order?.observacao || "Não informada"}</p>
              </details>
              <dl className="schedule-order-fields">
                {[
                  [
                    "Data de abertura",
                    orderDate(data.detail?.order?.data_abertura),
                  ],
                  [
                    "Data prevista de entrega",
                    orderDate(data.detail?.order?.data_entrega_prevista),
                  ],
                  [
                    "Tipo de atendimento",
                    data.detail?.order?.tipo_atendimento_nome ||
                      "Não informado",
                  ],
                  [
                    "Situação",
                    data.detail?.order?.situacao_nome || "Não informada",
                  ],
                  [
                    "Status do lançamento",
                    data.detail?.order?.status_lancamento_nome ||
                      "Não informado",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <OrderDetailLink
                id={String(data.schedule.order_id)}
                company={data.schedule.company_id}
              >
                Ver detalhes da OS
              </OrderDetailLink>
            </section>
            <nav className="app-section-tabs" aria-label="Abas da programação">
              {[
                ["operations", "Operações"],
                ["products", "Produtos"],
                ["services", "Serviços"],
                ["costs", "Custos"],
              ].map(([k, n]) => (
                <button
                  key={k}
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                >
                  {n}
                </button>
              ))}
            </nav>
            {tab === "operations" && (
              <>
                <p>
                  Datas e horários de Brasília. Duração total = duração ×
                  quantidade de pessoas. O envio ao dispositivo será integrado
                  posteriormente.
                </p>
                <div className="scheduling-table">
                  <table className="operations-table">
                    <thead>
                      <tr>
                        {[
                          "Operação",
                          "Tipo Serviço",
                          "Descrição da Operação",
                          "Checklist",
                          "Responsável",
                          "Equipe de Apoio",
                          "Data de Programação",
                          "Hora início",
                          "Duração (h)",
                          "Duração Total (h)",
                          "Apontamento total (h)",
                          "Calendário",
                          "Status",
                          "Enviado dispositivo",
                          "Observação interna",
                          "Veículo",
                          "Execução",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.operations.map((o: any) => (
                        <OperationRow
                          key={o.id}
                          operation={o}
                          data={data}
                          busy={busy}
                          mutate={mutate}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  disabled={busy}
                  onClick={() => void mutate({ action: "add_operation" })}
                >
                  <Plus size={16} />
                  Adicionar operação
                </button>
              </>
            )}
            {["products", "services", "costs"].includes(tab) && (materials.some((m: any) => m.source_linked) || services.some((s: any) => s.source_linked)) && <p className="schedule-linked-legend">Linhas amarelas: itens da OS vinculada.</p>}
            {data.linked_detail_incomplete && ["products","services","costs"].includes(tab) && <p role="status">O detalhamento da OS vinculada ainda não foi importado completamente; os itens e custos podem estar incompletos.</p>}
            {tab === "products" && (
              <>
                <p>
                  Itens da OS principal e, abaixo, os códigos distintos da OS vinculada. Retirada e utilização ficam em branco
                  até o preenchimento pela equipe responsável.
                </p>
                {!data.detail?.detail_at && (
                  <p>
                    Detalhamento do ERP ainda não coletado; a lista pode estar
                    incompleta.
                  </p>
                )}
                <div className="scheduling-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Unidade</th>
                        <th>Quantidade empenhada</th>
                        <th>Quantidade Retirada</th>
                        <th>Quantidade Utilizada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m: any) => {
                        const u = data.usage.find(
                          (u: any) => itemMatches(u,m),
                        );
                        return (
                          <tr key={itemIdentity(m)} className={m.source_linked ? "schedule-linked-item" : undefined}>
                            <td>{m.produto_id || "—"}</td>
                            <td>{m.produto_nome}<ItemInconsistency item={m}/></td>
                            <td>{m.unidade_nome}</td>
                            <td>{qty(m.quantidade)}</td>
                            {["withdrawn", "used"].map((field) => (
                              <td key={field}>
                                <input
                                  key={u?.version || 0}
                                  aria-label={
                                    (field === "withdrawn"
                                      ? "Quantidade Retirada "
                                      : "Quantidade Utilizada ") +
                                    m.produto_nome
                                  }
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  defaultValue={u?.[field] ?? ""}
                                  disabled={busy || !canUse}
                                  onBlur={(e) => {
                                    const value = number(e.target.value);
                                    if (
                                      value !==
                                      (u?.[field] == null
                                        ? null
                                        : Number(u[field]))
                                    )
                                      void mutate({
                                        action: "usage",
                                        itemId: String(m.id_m8),
                                        item_company:m.item_company, item_order:m.item_order,
                                        version: u?.version ?? null,
                                        withdrawn:
                                          u?.withdrawn == null
                                            ? null
                                            : Number(u.withdrawn),
                                        used:
                                          u?.used == null
                                            ? null
                                            : Number(u.used),
                                        [field]: value,
                                      });
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!materials.length && (
                    <p>Nenhum produto disponível nesta OS.</p>
                  )}
                </div>
              </>
            )}
            {tab === "services" && (
              <div className="scheduling-table">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Serviço</th>
                      <th>Unidade</th>
                      <th>Quantidade</th>
                      <th>Preço unitário</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s: any) => (
                      <tr key={itemIdentity(s)} className={s.source_linked ? "schedule-linked-item" : undefined}>
                        <td>{s.servico_id}</td>
                        <td>{s.servico_nome}</td>
                        <td>{s.service_unit || "—"}</td>
                        <td>{qty(s.quantidade)}</td>
                        <td>{money(s.valor_unitario)}</td>
                        <td>{money(s.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!services.length && <p>Nenhum serviço disponível nesta OS.</p>}
              </div>
            )}
            {tab === "costs" && (
              <ScheduleCosts
                data={data}
                materials={materials}
                services={services}
                busy={busy}
                mutate={mutate}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
function ScheduleOverview({ schedules }: { schedules: any[] }) {
  const operations: Record<string, number> = {};
  const orders: Record<string, number> = {};
  for (const s of schedules) {
    orders[s.programming_status || "pending"] =
      (orders[s.programming_status || "pending"] || 0) + 1;
    for (const [status, count] of Object.entries(
      s.operation_status_counts || {},
    ))
      operations[status] = (operations[status] || 0) + Number(count);
  }
  const totalOperations = schedules.reduce(
    (n, s) => n + Number(s.operation_count || 0),
    0,
  );
  return (
    <section className="schedule-overview" aria-label="Resumo da programação">
      <div className="schedule-overview-cards">
        <article>
          <span>Total de OSs</span>
          <strong>{schedules.length.toLocaleString("pt-BR")}</strong>
          <small>Ordens incluídas na programação</small>
        </article>
        <article>
          <span>Total de operações</span>
          <strong>{totalOperations.toLocaleString("pt-BR")}</strong>
          <small>
            {operations.completed || 0} concluídas ·{" "}
            {totalOperations - (operations.completed || 0)} em aberto
          </small>
        </article>
        {Object.entries(scheduleStatusNames).map(([status, label]) => (
          <article key={status}>
            <span>{label}</span>
            <strong>
              {(orders[status] || 0).toLocaleString("pt-BR")} <em>OSs</em>
            </strong>
            <small>
              {operations[status] || 0} operações · {statusNames[status]}
            </small>
          </article>
        ))}
      </div>
      <small>
        O status da OS considera a primeira etapa de programação ainda pendente;
        operações em execução têm prioridade. A OS fica concluída quando todas
        as operações estão concluídas.
      </small>
    </section>
  );
}
function SupportPicker({ position, disabled, users, selected, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || disabled || !panel.current) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const r = trigger.current.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 16);
      panel.current.style.width = width + "px";
      panel.current.style.left =
        Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + "px";
      const height = Math.min(240, window.innerHeight - 16);
      panel.current.style.maxHeight = height + "px";
      panel.current.style.top =
        Math.max(8, Math.min(r.bottom + 4, window.innerHeight - height - 8)) +
        "px";
    };
    place();
    panel.current.showPopover();
    panel.current.querySelector("input")?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, disabled]);
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = users.filter((u: any) =>
    fold(u.display_name || u.email).includes(fold(query.trim())),
  );
  return (
    <div
      className="support-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
        // Enter in this picker selects a person without submitting the operation.
        if (e.key === "Enter") e.stopPropagation();
      }}
    >
      <div className="support-selected">
        {selected.map((email: string) => (
          <span key={email}>
            {users.find((u: any) => u.email === email)?.display_name || email}
            <button
              type="button"
              disabled={disabled}
              aria-label={
                "Remover apoio " +
                (users.find((u: any) => u.email === email)?.display_name ||
                  email)
              }
              onClick={() =>
                onChange(selected.filter((v: string) => v !== email))
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        ref={trigger}
        className="support-add"
        type="button"
        aria-label={"Equipe de Apoio " + position}
        aria-expanded={open && !disabled}
        aria-controls={"support-options-" + position}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        + adicionar
      </button>
      {open && !disabled && (
        <div
          ref={panel}
          popover="auto"
          onToggle={(e) => {
            if (e.newState === "closed") setOpen(false);
          }}
          className="support-options"
          id={"support-options-" + position}
        >
          <input
            autoFocus
            aria-label={"Filtrar equipe de apoio " + position}
            placeholder="Pesquisar usuário..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="support-options-list"
            role="group"
            aria-label="Usuários de apoio"
          >
            {filtered.map((u: any) => (
              <button
                type="button"
                key={u.email}
                aria-pressed={selected.includes(u.email)}
                onClick={() => {
                  if (!selected.includes(u.email))
                    onChange([...selected, u.email]);
                }}
              >
                <span>{u.display_name || u.email}</span>
                {selected.includes(u.email) && (
                  <span aria-hidden="true">✓</span>
                )}
              </button>
            ))}
            {!filtered.length && <small>Nenhum usuário encontrado.</small>}
          </div>
        </div>
      )}
    </div>
  );
}
function OperationRow({
  operation: o,
  data,
  busy,
  mutate,
}: {
  operation: any;
  data: any;
  busy: boolean;
  mutate: (b: any) => Promise<boolean>;
}) {
  const noteDialog = useRef<HTMLDialogElement>(null);
  const [noteError, setNoteError] = useState("");
  const noteBeforeEditing = useRef("");
  const [d, setD] = useState(o.document),
    [expanded, setExpanded] = useState(false),
    [hours, setHours] = useState(""),
    [description, setDescription] = useState("");
  useEffect(() => setD(o.document), [o.version]);
  const locked =
      busy || ["completed", "reviewed", "awaiting_review"].includes(o.status),
    users = data.users.filter(
      (u: any) =>
        u.enabled || u.email === d.responsible || d.support.includes(u.email),
    );
  function change(k: string, v: any, save = false) {
    const next = {
      ...d,
      [k]: v,
      ...(k === "responsible"
        ? { support: d.support.filter((e: string) => e !== v), jobTitle: data.users.find((u: any) => u.email === v)?.job_title || "" }
        : {}),
      ...(k === "checklistId" ? { checked: [] } : {}),
      ...(k === "date" && !v ? { time: "" } : {}),
    };
    setD(next);
  }
  const dirty = JSON.stringify(d) !== JSON.stringify(o.document);
  async function persist(next = d) {
    if (locked) return false;
    if (JSON.stringify(next) !== JSON.stringify(o.document))
      return await mutate({
        action: "operation",
        operationId: o.id,
        version: o.version,
        document: next,
      });
    return true;
  }
  const assigned =
      d.responsible === data.email || d.support.includes(data.email),
    canWork = data.canEditSettings || assigned,
    canFinish = data.canEditSettings || d.responsible === data.email;
  const action = (action: string) => {
    if (dirty || busy) return;
    void mutate({
      action,
      operationId: o.id,
      version: o.version,
      hours: number(hours),
      description,
    });
  };
  const checklist = data.settings.document.checklists.find(
    (c: any) => c.id === d.checklistId,
  );
  return (
    <>
      <tr
        className={dirty ? "operation-unsaved" : undefined}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            !(e.target instanceof HTMLButtonElement)
          ) {
            e.preventDefault();
            void persist();
          }
        }}
      >
        <td>
          <strong>{o.position}</strong>
          {dirty && <small className="operation-draft-label">Não salvo</small>}
        </td>
        <td>
          <select
            aria-label={"Tipo Serviço " + o.position}
            disabled={locked}
            value={d.serviceType}
            onChange={(e) => change("serviceType", e.target.value, true)}
          >
            <option value="">Selecionar</option>
            {data.settings.document.serviceTypes.map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </td>
        <td>
          <input
            aria-label={"Descrição da Operação " + o.position}
            disabled={locked}
            maxLength={40}
            value={d.description}
            onChange={(e) => change("description", e.target.value)}
          />
          <small className="operation-description-count">
            {d.description.length}/40
          </small>
        </td>
        <td>
          <div className="operation-checklist-select" title={checklist ? [checklist.prefix, checklist.name].filter(Boolean).join(" - ") : "Sem checklist"}>
          <select
            aria-label={"Checklist " + o.position}
            disabled={locked || !!o.document.checklistRun}
            value={d.checklistId}
            onChange={(e) => change("checklistId", e.target.value, true)}
          >
            <option value="">Sem checklist</option>
            {data.settings.document.checklists.map((c: any) => (
              <option key={c.id} value={c.id}>
                {[c.prefix, c.name].filter(Boolean).join(" - ")}
              </option>
            ))}
          </select>
          <span aria-hidden="true">{checklist?.prefix?.trim() || checklist?.name || "Sem checklist"}</span>
          </div>
        </td>
        <td>
          <select
            aria-label={"Responsável " + o.position}
            disabled={locked}
            value={d.responsible}
            onChange={(e) => change("responsible", e.target.value, true)}
          >
            <option value="">Não atribuído</option>
            {users.map((u: any) => (
              <option key={u.email} value={u.email}>
                {u.display_name || u.email}
              </option>
            ))}
          </select>
        </td>
        <td>
          <SupportPicker
            position={o.position}
            disabled={locked}
            users={users.filter((u: any) => u.email !== d.responsible)}
            selected={d.support}
            onChange={(value: string[]) => change("support", value)}
          />
        </td>
        <td>
          <input
            aria-label={"Data de Programação " + o.position}
            type="date"
            disabled={locked}
            value={d.date}
            onChange={(e) => change("date", e.target.value)}
          />
        </td>
        <td>
          <input
            aria-label={"Hora início " + o.position}
            type="time"
            disabled={locked || !d.date}
            value={d.time}
            onChange={(e) => change("time", e.target.value)}
          />
        </td>
        <td>
          <input
            aria-label={"Duração " + o.position}
            type="number"
            min="0"
            max="10000"
            step="0.001"
            disabled={locked}
            value={d.duration ?? ""}
            onChange={(e) => change("duration", number(e.target.value))}
          />
        </td>
        <td>
          {totalHours(d) == null
            ? "—"
            : totalHours(d)!.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 3,
              })}
        </td>
        <td aria-label={"Apontamento total da operação " + o.position}>
          {(data.events || []).filter((event: any) => String(event.operation_id) === String(o.id) && event.action === "work_log").reduce((total: number, event: any) => total + Number(event.hours || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
        </td>
        <td>
          <select
            aria-label={"Calendário " + o.position}
            disabled={locked}
            value={d.calendarId}
            onChange={(e) => change("calendarId", e.target.value, true)}
          >
            {data.settings.document.calendars.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </td>
        <td>
          <span className={"operation-status " + o.status}>
            {statusNames[o.status]}
          </span>
        </td>
        <td>{o.sent_at ? "Sim" : "Não"}</td>
        <td>
          <button
            className="operation-note-preview"
            aria-label={"Observação interna " + o.position}
            onClick={() => { noteBeforeEditing.current = d.internalNote || ""; setNoteError(""); noteDialog.current?.showModal(); }}
          >
            {d.internalNote || "Incluir observação"}
          </button>
          <dialog
            ref={noteDialog}
            className="operation-note-dialog"
            onCancel={(e) => { e.preventDefault(); if (!busy) { change("internalNote", noteBeforeEditing.current); noteDialog.current?.close(); } }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h3>Observação interna · Operação {o.position}</h3>
            <textarea
              aria-label="Texto da observação interna"
              readOnly={locked}
              value={d.internalNote || ""}
              onChange={(e) => change("internalNote", e.target.value)}
            />
            <p>Salvar grava a observação e todos os campos alterados desta operação.</p>
            {noteError && <p role="alert">{noteError}</p>}
            <button disabled={locked} onClick={async () => {
              setNoteError("");
              if (await persist()) noteDialog.current?.close();
              else setNoteError("Não foi possível salvar. Verifique os campos da operação e tente novamente; sua edição foi mantida.");
            }} aria-label="Salvar" title="Salvar"><SaveActionIcon /></button>
            <button disabled={busy} onClick={() => { change("internalNote", noteBeforeEditing.current); setNoteError(""); noteDialog.current?.close(); }}>Cancelar</button>
          </dialog>
        </td>
        <td>
          <select
            aria-label={"Veículo " + o.position}
            disabled={locked}
            value={d.vehicleId || ""}
            onChange={(e) => change("vehicleId", e.target.value)}
          >
            <option value="">Não selecionado</option>
            {(data.settings.document.vehicles || []).map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </td>
        <td>
          <button
            disabled={locked || !dirty}
            aria-label={"Salvar operação " + o.position}
            onClick={() => void persist()}
           title={"Salvar operação " + o.position}><SaveActionIcon /></button>
          {dirty && (
            <small className="operation-draft-label" role="status">
              Alterações não salvas
            </small>
          )}
          {data.canEditSettings && <button type="button" disabled={busy||dirty||o.status!=="scheduled"||!d.responsible} onClick={()=>void mutate({action:"dispatch",operationId:o.id,version:o.version})}>{o.sent_at?"Enviado ao técnico":"Enviar ao técnico"}</button>}
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? "Fechar" : "Acompanhar"}
          </button>
          <button
            aria-label={"Remover operação " + o.position}
            disabled={
              busy || !["pending", "planning", "scheduled"].includes(o.status)
            }
            onClick={() => {
              if (window.confirm("Remover esta operação?"))
                void mutate({
                  action: "remove_operation",
                  operationId: o.id,
                  version: o.version,
                });
            }}
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              e.target instanceof HTMLInputElement &&
              e.target.type === "checkbox"
            ) {
              e.preventDefault();
              void persist();
            }
          }}
        >
          <td colSpan={17}>
            <section className="operation-execution">
              {dirty && (
                <p className="operation-draft-label">
                  Salve as alterações da operação antes de registrar ações de
                  execução.
                </p>
              )}
              <h3>
                Operação {o.position} · {d.description || "Sem descrição"}
              </h3>
              {(checklist || o.document.checklistRun) && <ScheduleChecklistRun operation={o} data={data} mutate={mutate} busy={busy} dirty={dirty}/>}
              {canWork &&
                !["completed", "reviewed", "awaiting_review"].includes(
                  o.status,
                ) && (
                  <div className="scheduling-actions">
                    <label>
                      Horas apontadas
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                      />
                    </label>
                    <label>
                      Observação
                      <input
                        maxLength={2000}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={dirty || busy || !hours || Number(hours) <= 0}
                      onClick={() => action("work_log")}
                    >
                      Registrar horas
                    </button>
                    <button
                      disabled={dirty || busy || o.status === "executing"}
                      onClick={() => action("activity")}
                    >
                      Iniciar execução
                    </button>
                  </div>
                )}
              <div className="scheduling-actions">
                {canFinish && o.status === "executing" && (
                  <>
                    <button
                      disabled={dirty || busy}
                      onClick={() => action("finish_partial")}
                    >
                      Finalizar parcial
                    </button>
                    <button
                      disabled={dirty || busy}
                      onClick={() => action("finish_full")}
                    >
                      Finalizar completa
                    </button>
                  </>
                )}
                {data.canEditSettings && o.status === "awaiting_review" && (
                  <button
                    disabled={dirty || busy}
                    onClick={() => action("review")}
                  >
                    Revisar operação
                  </button>
                )}
                {data.canEditSettings && o.status === "reviewed" && (
                  <button
                    disabled={dirty || busy}
                    onClick={() => action("complete")}
                  >
                    Concluir operação
                  </button>
                )}
              </div>
              <ul>
                {data.events
                  .filter((e: any) => e.operation_id === o.id)
                  .map((e: any) => (
                    <li key={e.id}>
                      {e.display_name || "Usuário"} ·{" "}
                      {new Date(e.created_at).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}{" "}
                      ·{" "}
                      {(
                        {
                          operation: "Programação alterada",
                          work_log: "Horas apontadas",
                          activity: "Execução iniciada",
                          finish_partial: "Finalização parcial",
                          finish_full: "Finalização completa",
                          review: "Operação revisada",
                          complete: "Operação concluída",
                        } as any
                      )[e.action] || e.action}
                      {e.hours ? " · " + qty(e.hours) + " h" : ""}{" "}
                      {e.description}
                    </li>
                  ))}
              </ul>
            </section>
          </td>
        </tr>
      )}
    </>
  );
}
function ScheduleCosts({ data, materials, services, busy, mutate }: any) {
  const [group, setGroup] = useState("operation");
  const labor = new Map<
    string,
    {
      name: string;
      hours: number;
      cost: number;
      missing: boolean;
      people: Set<string>;
    }
  >();
  for (const o of data.operations) {
    const d = o.document;
    if (d.serviceType !== "Interno") continue;
    const key =
      group === "operation" ? String(o.position) : data.users.find((u: any) => u.email === d.responsible)?.job_title || "Sem função";
    if (!labor.has(key))
      labor.set(key, {
        name:
          group === "operation"
            ? `Operação ${o.position} · ${d.description || "Sem descrição"}`
            : key,
        hours: 0,
        cost: 0,
        missing: false,
        people: new Set(),
      });
    const row = labor.get(key)!;
    const emails = [
      ...new Set<string>([d.responsible, ...d.support].filter(Boolean)),
    ];
    if (d.duration == null || !emails.length) row.missing = true;
    for (const email of emails) {
      const u = data.users.find((u: any) => u.email === email);
      row.people.add(u?.display_name || email);
      row.hours += Number(d.duration || 0);
      if (u?.hourly_cost == null) row.missing = true;
      else row.cost += Number(d.duration || 0) * Number(u.hourly_cost);
    }
  }
  const serviceRevenue = services.reduce(
    (sum: number, s: any) => sum + Number(s.valor_total || 0),
    0,
  );
  const productCost = (m: any) =>
    m.current_average_cost != null &&
    Number.isFinite(Number(m.current_average_cost)) &&
    Number(m.current_average_cost) >= 0 &&
    m.quantidade != null &&
    sameUnit(m.unidade_nome, m.current?.unit)
      ? Number(m.current_average_cost) * Number(m.quantidade)
      : null;
  const sumKnown = (values: (number | null)[]) =>
    values.some((v) => v == null)
      ? null
      : values.reduce<number>((a, b) => a + b!, 0);
  const productsTotal = sumKnown(materials.map(productCost));
  const laborTotal = sumKnown(
    [...labor.values()].map((r) => (r.missing ? null : r.cost)),
  );
  const serviceCost = (s: any) => {
    if (isMaintenancePackage(s)) return maintenanceCost(s, services, laborTotal);
    const c = data.costs.find((c: any) => itemMatches(c,s));
    return c?.cost == null ? null : Number(c.cost);
  };
  const servicesTotal = sumKnown(services.map(serviceCost));
  const additionalServicesTotal = sumKnown(services.filter((s: any) => !isMaintenancePackage(s)).map(serviceCost));
  const total = sumKnown([productsTotal, laborTotal, additionalServicesTotal]);
  const revenue =
    serviceRevenue +
    materials.reduce((a: number, m: any) => a + Number(m.valor_total || 0), 0);
  return (
    <div className="schedule-costs">
      <div className="schedule-summary">
        {[
          ["Custo total de Produtos", money(productsTotal)],
          ["Custo total de Mão de Obra", money(laborTotal)],
          ["Custo total de Serviços", money(servicesTotal)],
          ["Custo total", money(total)],
          ["Valor de Venda", money(revenue)],
          ["Lucro", money(total == null ? null : revenue - total)],
          ["Margem do Lucro", margin(revenue, total)],
          ["Markup", markup(revenue, total)],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <p>
        Valores previstos. Totais dependem dos custos informados. A mão de obra
        atribuída ao serviço de manutenção PCT é contabilizada uma única vez no custo total.
      </p>
      <section>
        <h2>Mão de obra interna</h2>
        <p>
          Custo planejado: duração de cada operação × custo/hora de cada pessoa
          atribuída. Custos ausentes não são tratados como zero.
        </p>
        <label>
          Agrupar custos por
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="operation">Operação</option>
            <option value="role">Função</option>
          </select>
        </label>
        <div className="scheduling-table">
          <table>
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Colaboradores</th>
                <th>Horas totais</th>
                <th>Custo previsto</th>
              </tr>
            </thead>
            <tbody>
              {[...labor.entries()].map(([k, r]) => (
                <tr key={k}>
                  <td>{r.name}</td>
                  <td>{[...r.people].join(", ") || "Não atribuído"}</td>
                  <td>{qty(r.hours)}</td>
                  <td>{r.missing ? "Dados incompletos" : money(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Produtos</h2>
        <p>
          Custo médio do cadastro de produtos da mesma empresa da OS, na unidade
          do item. Custo total = custo médio × quantidade. Margem = (venda −
          custo) ÷ venda.
        </p>
        <div className="scheduling-table">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Custo médio unitário</th>
                <th>Custo total</th>
                <th>Venda na OS</th>
                <th>Margem</th>
                <th title="(Venda − custo) ÷ custo × 100">Markup</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m: any) => {
                const cost = productCost(m);
                return (
                  <tr key={itemIdentity(m)} className={m.source_linked ? "schedule-linked-item" : undefined}>
                    <td>{m.produto_id || "—"}</td>
                    <td>{m.produto_nome}<ItemInconsistency item={m}/></td>
                    <td>{qty(m.quantidade)}</td>
                    <td>
                      {money(cost == null ? null : m.current_average_cost)}
                    </td>
                    <td>{money(cost)}</td>
                    <td>{money(m.valor_total)}</td>
                    <td>{margin(m.valor_total, cost)}</td>
                    <td>{markup(m.valor_total, cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Serviços</h2>
        <p>
          Venda total: <strong>{money(serviceRevenue)}</strong>. Informe o custo
          total por item ou aproveite o custo de mão de obra do cálculo de lucro
          salvo, rateado proporcionalmente à venda dos serviços.
        </p>
        {data.profit?.labor != null && (
          <p>
            Custo de mão de obra no cálculo salvo: {money(data.profit.labor)}.
          </p>
        )}
        <div className="scheduling-table">
          <table>
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Venda na OS</th>
                <th>Custo total</th>
                <th>Margem</th>
                <th title="(Venda − custo) ÷ custo × 100">Markup</th>
                <th>Referência</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s: any) => {
                const c = data.costs.find(
                    (c: any) => itemMatches(c,s),
                  ),
                  referenceProfit = s.source_linked ? s.source_profit : data.profit,
                  referenceRevenue = services.filter((item: any) => String(item.item_company) === String(s.item_company) && String(item.item_order) === String(s.item_order)).reduce((sum: number,item: any) => sum + Number(item.valor_total || 0),0),
                  cost = serviceCost(s),
                  payload = {
                    action: "service_cost",
                    itemId: String(s.id_m8),
                    item_company:s.item_company, item_order:s.item_order,
                    version: c?.version ?? null,
                  };
                return (
                  <tr key={itemIdentity(s)} className={s.source_linked ? "schedule-linked-item" : undefined}>
                    <td>{s.servico_nome}</td>
                    <td>{money(s.valor_total)}</td>
                    <td>
                      {isMaintenancePackage(s) ? <span>{money(cost)}</span> : <input
                        key={c?.version || 0}
                        aria-label={"Custo do serviço " + s.servico_nome}
                        disabled={busy}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={cost ?? ""}
                        onBlur={(e) => {
                          if (number(e.target.value) !== cost)
                            void mutate({
                              ...payload,
                              cost: number(e.target.value),
                            });
                        }}
                      />}
                    </td>
                    <td>{margin(s.valor_total, cost)}</td>
                    <td>{markup(s.valor_total, cost)}</td>
                    <td>
                      {isMaintenancePackage(s) ? <small>Mão de obra interna · automático{services.filter(isMaintenancePackage).length > 1 ? " (rateada entre os itens PCT)" : ""}</small> : <button
                        disabled={
                          busy ||
                          referenceProfit?.labor == null ||
                          referenceRevenue <= 0
                        }
                        onClick={() =>
                          void mutate({
                            ...payload,
                            cost:
                              Math.round(
                                ((Number(referenceProfit.labor) *
                                  Number(s.valor_total || 0)) /
                                  referenceRevenue) *
                                  100,
                              ) / 100,
                          })
                        }
                      >
                        Usar cálculo de lucro
                      </button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <small>
          O serviço de manutenção PCT utiliza automaticamente a mão de obra interna.
          No custo geral da OS, esse valor é contado uma única vez.
        </small>
      </section>
    </div>
  );
}
function ScheduleSettings({ data, onSaved }: any) {
  const [tab, setTab] = useState("types"),
    [d, setD] = useState(data.settings.document),
    [version, setVersion] = useState(data.settings.version),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(next: any) {
    if (busy) return false;
    const before = d;
    setD(next);
    setError("");
    let document;
    try {
      document = validateSettings(next);
    } catch (e) {
      setD(before);
      setError((e as Error).message);
      return false;
    }
    setBusy(true);
    try {
      const result = await request({ action: "settings", version, document });
      setVersion(result.settings.version);
      setD(result.settings.document);
      onSaved(result.settings);
      return true;
    } catch (e) {
      setD(before);
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="scheduling-settings">
      <h2>Configurações da programação</h2>
      <nav className="app-section-tabs">
        {[
          ["types", "Tipos de serviço"],
          ["checklists", "Checklists"],
          ["vehicles", "Veículos"],
          ["pauses", "Causas de pausa"],
          ["calendars", "Calendários"],
          ["rules", "Entrada automática"],
        ].map(([k, n]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {n}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      <span className="schedule-save-status" role="status">
        {busy ? "Salvando…" : ""}
      </span>
      {!data.canEditSettings && (
        <p>Somente administradores podem alterar as configurações.</p>
      )}
      <fieldset disabled={busy || !data.canEditSettings}>
        {tab === "vehicles" && <>
          <p>Informe o nome e, se desejar, a placa. Salve a linha com Enter ou no botão Salvar.</p>
          <CompactNameTable label="Veículo" items={d.vehicles || []} maxLength={160} busy={busy}
            onSave={(id,name)=>save({...d,vehicles:d.vehicles.map((v:any)=>v.id===id?{...v,name}:v)})}
            onRemove={id=>save({...d,vehicles:d.vehicles.filter((v:any)=>v.id!==id)})}
            onAdd={name=>save({...d,vehicles:[...(d.vehicles||[]),{id:crypto.randomUUID(),name}]})}/>
        </>}
        {tab === "types" && <>
          <p>Edite os tipos de serviço diretamente na tabela. Salve a linha com Enter ou no botão Salvar.</p>
          <CompactNameTable label="Tipo de serviço" items={d.serviceTypes.map((name:string,i:number)=>({id:name,name}))} maxLength={80} busy={busy}
            onSave={(id,name)=>save({...d,serviceTypes:d.serviceTypes.map((v:string,i:number)=>v===id?name:v)})}
            onRemove={id=>save({...d,serviceTypes:d.serviceTypes.filter((v:string)=>v!==id)})}
            onAdd={name=>save({...d,serviceTypes:[...d.serviceTypes,name]})}/>
        </>}
        {tab === "checklists" && <ScheduleChecklistEditor attendanceTypes={data.automaticOptions?.tipo_atendimento_nome || []} settings={d} onChange={setD} onSave={save} busy={busy}/>}
        {tab === "pauses" && <SchedulePauseReasons settings={d} onChange={setD} onSave={save} busy={busy}/>}
        {tab === "calendars" && <ScheduleCalendarEditor settings={d} onChange={setD} onSave={save} busy={busy}/>}

      </fieldset>
      {tab === "rules" && <ScheduleAutomaticRules settings={d} options={data.automaticOptions} onChange={setD} onSave={save} busy={busy} canEdit={data.canEditSettings}/>}

    </section>
  );
}
