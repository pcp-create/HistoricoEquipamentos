"use client";
import ActionNotice from "./action-notice";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Users,
  FileText,
  ClipboardList,
  TrendingUp,
  Plus,
  RefreshCw,
  X,
  Search,
  Pencil,
  Target,
  UserPlus,
  Building2,
  ContactRound,
  Save,
  CircleX,
} from "lucide-react";
import SiteHeader from "./site-header";
import ContactDeleteButton from "./contact-delete-button";
import ContactJobEditor from "./contact-job-editor";
import OrderDetailLink from "./order-detail-link";
import OrderSearchSelect from "./order-search-select";
import { companyName } from "@/lib/company-names";
import { contactJobLabel } from "@/lib/contact-job-label";
import { crmApi, crmStatus, crmMoney, crmDate } from "./crm-api";
import "./crm.css";
const crmTabs = [
  ["leads", "Leads"],
  ["customers", "Clientes"],
  ["contacts", "Contatos"],
  ["opportunities", "Oportunidades"],
  ["proposals", "Propostas"],
  ["orders", "Pedidos (OSs)"],
];
const stages: Record<string, string> = {
  prospecting: "Prospecção",
  qualification: "Qualificação",
  proposal: "Proposta",
  negotiation: "Negociação",
  financial: "Aprovação financeira",
  closed: "Encerrada",
};
const day = (value: string) =>
  value ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR") : "—";
export default function Crm() {
  const params = useSearchParams(),
    [kind, setKind] = useState(
      crmTabs.some(([key]) => key === params.get("tab"))
        ? params.get("tab")!
        : "opportunities",
    ),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<any>(null),
    [overview, setOverview] = useState<any>(null),
    [catalog, setCatalog] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [opportunity, setOpportunity] = useState<any>(null),
    [contact, setContact] = useState<any>(null);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    crmApi(
      "?" +
        new URLSearchParams({ kind, q: search, status, page: String(page) }),
      undefined,
      c.signal,
    )
      .then(setResult)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [kind, search, status, page, refresh]);
  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      crmApi("?overview=1", undefined, c.signal),
      crmApi("?catalogs=1", undefined, c.signal),
    ])
      .then(([o, cat]) => {
        setOverview(o);
        setCatalog(cat);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [refresh]);
  async function open(id: string) {
    setError("");
    try {
      setOpportunity(await crmApi("?opportunity=" + id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const id = params.get("opportunity");
    if (id) void open(id);
  }, [params]);
  const stats = [
    ["Oportunidades", overview?.opportunities, Target, "Registradas no CRM"],
    ["Propostas", overview?.proposals, FileText, "Propostas comerciais locais"],
    [
      "Pedidos de Venda (OSs)",
      overview?.orders,
      ClipboardList,
      "OSs vinculadas às propostas",
    ],
    [
      "Taxa de conversão",
      overview ? overview.conversion.toLocaleString("pt-BR") + "%" : undefined,
      TrendingUp,
      `${overview?.converted ?? 0} oportunidades convertidas`,
    ],
  ] as const;
  const directory = ["leads", "customers", "contacts"].includes(kind);
  const count = result?.total ?? 0;
  return (
    <>
      <SiteHeader active="crm" />
      <main className="main crm-main">
        <header className="crm-heading">
          <div>
            <div className="eyebrow">COMERCIAL</div>
            <h1>CRM</h1>
            <p>Relacionamentos, oportunidades e propostas em um só lugar.</p>
          </div>
          <div className="crm-actions">
            <button
              className="button"
              disabled={loading}
              onClick={() => setRefresh((n) => n + 1)}
            >
              <RefreshCw size={16} />
              Atualizar
            </button>
            {kind === "opportunities" && (
              <button
                className="button primary"
                disabled={!catalog}
                onClick={() => setOpportunity({})}
              >
                <Plus size={16} />
                Nova oportunidade
              </button>
            )}
          </div>
        </header>
        <section className="stats" aria-label="Resumo do CRM">
          {stats.map(([label, value, Icon, note]) => (
            <article className="stat" key={label}>
              <div className="stat-top">
                <span>{label}</span>
                <span className="stat-icon">
                  <Icon size={21} />
                </span>
              </div>
              <strong>
                {value === undefined
                  ? "—"
                  : typeof value === "number"
                    ? value.toLocaleString("pt-BR")
                    : value}
              </strong>
              <small>{note}</small>
            </article>
          ))}
        </section>
        <section className="results-panel crm-workspace">
          <nav
            className="view-tabs app-section-tabs"
            aria-label="Listas do CRM"
          >
            {crmTabs.map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={kind === key ? "active" : ""}
                aria-pressed={kind === key}
                onClick={() => {
                  setKind(key);
                  setStatus("");
                  setPage(1);
                  setResult(null);
                  const url = new URL(window.location.href);
                  url.searchParams.set("tab", key);
                  window.history.replaceState(null, "", url);
                }}
              >
                {key === "leads" ? <UserPlus size={17} aria-hidden="true" />
                  : key === "customers" ? <Building2 size={17} aria-hidden="true" />
                  : key === "contacts" ? <ContactRound size={17} aria-hidden="true" />
                  : key === "opportunities" ? <Target size={17} aria-hidden="true" />
                  : key === "proposals" ? <FileText size={17} aria-hidden="true" />
                  : <ClipboardList size={17} aria-hidden="true" />}
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="crm-list-heading">
            <div>
              <h2>{crmTabs.find(([key]) => key === kind)?.[1]}</h2>
              <span>
                {loading
                  ? "Carregando…"
                  : `${count.toLocaleString("pt-BR")} registros`}
              </span>
            </div>
            {directory && (
              <Link className="button" href="/visitas">
                Abrir visitas e cadastros
              </Link>
            )}
          </div>
          <form
            className="crm-filter"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q);
              setPage(1);
            }}
          >
            <label>
              Pesquisar
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  directory
                    ? "Nome, documento, telefone ou e-mail"
                    : "Número, título ou cliente"
                }
              />
            </label>
            {!directory && (
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todos</option>
                  {(kind === "opportunities"
                    ? ["open", "lost", "cancelled"]
                    : kind === "proposals"
                      ? ["creating", "in_review", "reviewed", "sent", "converting", "won", "lost", "cancelled"]
                      : [
                          "complete",
                          "preparing",
                          "ready",
                          "sending",
                          "partial",
                          "uncertain",
                          "rejected",
                          "validation_failed",
                        ]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {crmStatus(s)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="button" type="submit">
              <Search size={16} />
              Pesquisar
            </button>
          </form>
          {error && (
            <ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>
          )}
          {loading ? (
            <p role="status">Carregando CRM…</p>
          ) : (
            <>
              <div className={`table-scroll crm-records${kind === "proposals" ? " crm-proposals-list" : ""}`}>
                <table>
                  <thead>
                    <tr>
                      {(kind === "opportunities"
                        ? [
                            "Oportunidade",
                            "Cliente / conta",
                            "Fase",
                            "Fechamento previsto",
                            "Valor",
                            "Probabilidade",
                            "Responsável",
                            "Tipo",
                            "Propostas / OSs",
                          ]
                        : kind === "proposals"
                          ? [
                              "Proposta",
                              "Cliente / conta",
                              "Equipamento",
                              "Oportunidade",
                              "Tipo de proposta",
                              "Status",
                              "Valor total",
                              "OS",
                              "Atualização",
                            ]
                          : kind === "orders"
                            ? [
                                "Pedido / OS",
                                "Cliente",
                                "Empresa",
                                "Proposta",
                                "Oportunidade",
                                "Status",
                                "Atualização",
                              ]
                            : kind === "contacts"
                              ? [
                                  "Contato",
                                  "Cliente",
                                  "Cargo",
                                  "Telefone",
                                  "E-mail",
                                  "Ações",
                                ]
                              : [
                                  "Nome",
                                  kind === "leads"
                                    ? "Responsável"
                                    : "CPF / CNPJ",
                                  "Cidade / UF",
                                  kind === "leads" ? "Endereço" : "Telefone",
                                  "E-mail",
                                ]
                      ).map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result?.rows.map((row: any) => (
                      <tr key={row.id}>
                        {kind === "opportunities" ? (
                          <>
                            <td>
                              <button
                                className="crm-record-link"
                                onClick={() => void open(row.id)}
                                aria-label={`OP-${row.number} · ${row.title}`}
                              >
                                OP-{row.number}
                              </button>
                              <strong>{row.title}</strong>
                            </td>
                            <td>
                              {row.customer_name}
                              {(row.customer_city || row.customer_state) && (
                                <small>
                                  {[row.customer_city, row.customer_state]
                                    .filter(Boolean)
                                    .join(" / ")}
                                </small>
                              )}
                            </td>
                            <td>
                              <span
                                className={
                                  "crm-status crm-stage-" +
                                  (row.order_count > 0
                                    ? "won"
                                    : row.commercial?.stage || "prospecting")
                                }
                              >
                                {row.order_count > 0
                                  ? "Ganha"
                                  : row.status !== "open"
                                    ? crmStatus(row.status)
                                    : stages[
                                        row.commercial?.stage || "prospecting"
                                      ]}
                              </span>
                            </td>
                            <td>{day(row.commercial?.closeDate)}</td>
                            <td>
                              {row.commercial?.amount
                                ? crmMoney(
                                    Math.round(
                                      Number(row.commercial.amount) * 100,
                                    ),
                                  )
                                : "—"}
                            </td>
                            <td>
                              {row.order_count > 0
                                ? "100"
                                : (row.commercial?.probability ?? 0)}
                              %
                            </td>
                            <td>{row.owner_name || row.created_by || "—"}</td>
                            <td>{row.type_name}</td>
                            <td>
                              {row.proposal_count} propostas
                              <small>{row.order_count} OSs</small>
                            </td>
                          </>
                        ) : kind === "proposals" ? (
                          <>
                            <td>
                              <Link
                                className="crm-proposal-number"
                                href={"/crm/propostas/" + row.id}
                              >
                                PROP-{row.number}
                              </Link>
                              <strong>{row.title}</strong>
                            </td>
                            <td>{row.customer_name}</td>
                            <td>{row.equipment_name || "Não informado"}</td>
                            <td>
                              <button
                                className="crm-record-link"
                                onClick={() => void open(row.opportunity_id)}
                              >
                                OP-{row.opportunity_number}
                              </button>
                            </td>
                            <td>{row.type_name}</td>
                            <td>
                              <span
                                className={
                                  "crm-status crm-status-" + row.status
                                }
                              >
                                {crmStatus(row.status)}
                              </span>
                            </td>
                            <td>{crmMoney(row.total_cents)}</td>
                            <td>{row.order_id ? <OrderDetailLink id={String(row.order_id)} company={row.order_company_id}>{`OS-${row.order_id}`}</OrderDetailLink> : '—'}</td>
                            <td>{crmDate(row.updated_at)}</td>
                          </>
                        ) : kind === "orders" ? (
                          <>
                            <td>
                              <OrderDetailLink id={String(row.order_id)} company={row.company_id}>
                                OS-{row.order_id}
                              </OrderDetailLink>
                            </td>
                            <td>{row.customer_name}</td>
                            <td>{companyName(String(row.company_id))}</td>
                            <td>
                              <Link
                                className="crm-proposal-number"
                                href={"/crm/propostas/" + row.proposal_id}
                              >
                                PROP-{row.proposal_number}
                              </Link>
                            </td>
                            <td>
                              <button
                                className="crm-record-link"
                                onClick={() => void open(row.opportunity_id)}
                              >
                                OP-{row.opportunity_number}
                              </button>
                            </td>
                            <td>
                              <span
                                className={
                                  "crm-status crm-status-" + row.status
                                }
                              >
                                {crmStatus(row.status)}
                              </span>
                            </td>
                            <td>{crmDate(row.updated_at)}</td>
                          </>
                        ) : kind === "contacts" ? (
                          <>
                            <td>
                              <strong>{row.name}</strong><br/><small>{row.m8_id&&!row.sync_requested?"Migrado":"Pendente"}</small>
                            </td>
                            <td>{row.customer_name}</td>
                            <td>{contactJobLabel(row) || "—"}</td>
                            <td>{row.phone || "—"}</td>
                            <td>{row.email || "—"}</td>
                            <td>
                              <button
                                className="button"
                                aria-label={`Editar contato ${row.name}`}
                                title="Editar contato"
                                onClick={() => setContact(row)}
                              >
                                <Pencil size={15} />
                              </button>
                              <ContactDeleteButton customer={row.customer_key} contact={row} onDeleted={()=>setRefresh(n=>n+1)}/>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              <strong>{row.name}</strong>
                            </td>
                            <td>
                              {kind === "leads"
                                ? row.owner_name
                                : row.document || "—"}
                            </td>
                            <td>
                              {[row.city, row.uf].filter(Boolean).join(" / ") ||
                                "—"}
                            </td>
                            <td>
                              {kind === "leads"
                                ? row.address || "—"
                                : row.phone || "—"}
                            </td>
                            <td>{row.email || "—"}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!result?.rows.length && (
                <div className="crm-empty">
                  <Users size={28} />
                  <h3>Nenhum registro encontrado</h3>
                  <p>
                    {directory
                      ? "Os cadastros disponíveis no sistema aparecem nesta lista."
                      : "Crie uma oportunidade ou ajuste a pesquisa para começar."}
                  </p>
                </div>
              )}
              <footer className="crm-pagination">
                <span>
                  {count
                    ? `${(page - 1) * 30 + 1}–${Math.min(page * 30, count)} de ${count}`
                    : "0 registros"}
                </span>
                <div className="crm-actions">
                  <button
                    className="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <span>Página {page}</span>
                  <button
                    className="button"
                    disabled={page * 30 >= count}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
        <p className="data-note">
          Conversão = oportunidades com ao menos uma OS criada ÷ total de
          oportunidades. Uma oportunidade é contada uma única vez.
        </p>
      </main>
      {contact && (
        <ContactJobEditor
          customer={contact.customer_key}
          contact={contact}
          onClose={() => setContact(null)}
          onDeleted={()=>{setContact(null); setRefresh(n=>n+1);}}
          onSaved={() => {
            setContact(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
      {opportunity && catalog && (
        <OpportunityDialog
          initial={opportunity}
          catalog={catalog}
          close={() => setOpportunity(null)}
          saved={(r: any) => {
            setOpportunity(r);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
function OpportunityDialog({
  initial,
  catalog,
  close,
  saved,
}: {
  initial: any;
  catalog: any;
  close: () => void;
  saved: (r: any) => void;
}) {
  const router = useRouter(),
    ref = useRef<HTMLDialogElement>(null),
    request = useRef(initial.id || crypto.randomUUID()),
    proposalRequest = useRef(crypto.randomUUID());
  const [data, setData] = useState(initial),
    [form, setForm] = useState({
      title: initial.title || "",
      typeId: String(initial.type_id || ""),
      customerId: String(initial.customer_id || ""),
      leadId: String(initial.lead_id || ""),
      customerName: initial.customer_name || "",
      company: String(initial.company_id || "1"),
      status: initial.status || "open",
      notes: initial.notes || "",
      commercial: {
        stage: "prospecting",
        probability: 0,
        amount: "",
        closeDate: "",
        contact: "",
        origin: "",
        ...initial.commercial,
      },
    }),
    [accountKind, setAccountKind] = useState<'customer'|'lead'>(initial.lead_id?'lead':'customer'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [proposalType, setProposalType] = useState(""),
    [proposalTitle, setProposalTitle] = useState(""),
    [proposalOpen, setProposalOpen] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const change = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  async function save(statusOverride?:string) {
    setBusy(true);
    setError("");
    try {
      if(accountKind==='lead'&&!form.leadId)throw Error('Selecione um lead cadastrado.');
      const row = await crmApi("", {
        action: "save-opportunity",
        ...form,
        status:statusOverride||form.status,
        id: request.current,
        version: data.version,
      });
      const updated = await crmApi("?opportunity=" + row.id);
      setData(updated);
      setForm(f=>({...f,status:updated.status}));
      saved(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addProposal() {
    setBusy(true);
    setError("");
    try {
      const p = await crmApi("", {
        action: "create-proposal",
        id: proposalRequest.current,
        opportunityId: data.id,
        typeId: proposalType,
        title: proposalTitle,
      });
      router.push("/crm/propostas/" + p.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const won = data.status === 'won' || Number(data.order_count || 0) > 0;
  const eventLabel = (s: string) =>
    ({
      opportunity_created: "Oportunidade criada",
      opportunity_updated: "Oportunidade alterada",
      proposal_created: "Proposta criada",
      proposal_updated: "Proposta alterada",
      attachment_added: "Anexo adicionado à proposta",
      attachment_removed: "Anexo removido da proposta",
      conversion_requested: "Criação de OS solicitada",
      proposal_converted: "Proposta concretizada",
    })[s] || s;
  return createPortal(
    <dialog
      ref={ref}
      className="crm-dialog crm-opportunity-dialog"
      aria-label={
        data.id ? "Oportunidade OP-" + data.number : "Nova oportunidade"
      }
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <header>
        <div className="crm-opportunity-heading"><span>OPORTUNIDADE</span><h2>{data.id ? "OP-" + data.number : "Nova oportunidade"}</h2></div>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={close}
          aria-label="Fechar oportunidade"
        >
          <X size={20} />
        </button>
      </header>
      <form className="crm-opportunity-form" id="crm-opportunity-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
          <div className="crm-form-grid crm-opportunity-grid">
            <label className="crm-wide">
              Título *
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <label>
              Tipo de oportunidade *
              <select
                required
                disabled={!!data.proposals?.length}
                value={form.typeId}
                onChange={(e) => change("typeId", e.target.value)}
              >
                <option value="">Selecione</option>
                {catalog.opportunityTypes
                  .filter((t: any) => t.active || String(t.id) === form.typeId)
                  .map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Empresa *
              <select
                disabled={!!data.proposals?.length}
                value={form.company}
                onChange={(e) => change("company", e.target.value)}
              >
                {["1", "2", "27404"].map((id) => (
                  <option key={id} value={id}>
                    {companyName(id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="crm-account-kind"><span>Cadastro *</span><div className="crm-account-kind-switch" role="group" aria-label="Tipo de cadastro">{([['customer','Cliente'],['lead','Lead']] as const).map(([kind,label])=><button key={kind} type="button" aria-pressed={accountKind===kind} disabled={!!data.customer_locked || won || (!!data.proposals?.length && kind==='lead' && !data.lead_id)} onClick={()=>{if(accountKind===kind)return;setAccountKind(kind);setForm(f=>({...f,customerId:'',customerName:'',leadId:''}));}}>{label}</button>)}</div></div>
            <label className="crm-wide">
              {accountKind==='lead' ? 'Lead *' : 'Cliente *'}
              <OrderSearchSelect
                label={accountKind==='lead' ? "Lead da oportunidade" : "Cliente da oportunidade"}
                disabled={!!data.customer_locked || won}
                endpoint={accountKind==='lead' ? "/api/crm?kind=leads" : "/api/crm?kind=customers"}
                customerIdentity={accountKind==='customer'}
                hideId={accountKind==='lead'}
                searchPlaceholder={accountKind==='lead'?'Pesquisar por nome ou cidade':'Pesquisar por ID ou descrição'}
                value={accountKind==='lead'?form.leadId:form.customerId}
                selectedLabel={form.customerName}
                onChange={(row) =>
                  setForm((f) => ({
                    ...f,
                    customerId: accountKind==='lead'?'':row.id,
                    leadId: accountKind==='lead'?row.id:'',
                    customerName: row.name,
                  }))
                }
              />
            </label>
            <label>
              Origem da oportunidade
              <select value={form.commercial.origin} onChange={e=>setForm(f=>({...f,commercial:{...f.commercial,origin:e.target.value}}))}>
                <option value="">Selecione</option>
                <option value="visit">Visita comercial</option>
                <option value="preventive">Controle de preventiva</option>
                <option value="customer_contact">Contato do cliente</option>
              </select>
            </label>
            {accountKind==='lead' && <small className="crm-opportunity-account-hint">Para gerar a OS, vincule a oportunidade a um cliente cadastrado no M8.</small>}
            <label>
              Status
              <select
                value={won ? "won" : form.status}
                disabled={won}
                onChange={(e) => change("status", e.target.value)}
              >
                {[...(won ? ["won"] : []), "open", "lost", "cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {crmStatus(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fase
              <select
                value={won ? "won" : form.commercial.stage}
                disabled={won}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    commercial: { ...f.commercial, stage: e.target.value },
                  }))
                }
              >
                {won && <option value="won">Ganha</option>}
                {Object.entries(stages).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data prevista de fechamento
              <input
                type="date"
                value={form.commercial.closeDate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    commercial: { ...f.commercial, closeDate: e.target.value },
                  }))
                }
              />
            </label>
            <label>
              Valor estimado (R$)
              <input
                type="number"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={form.commercial.amount}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    commercial: { ...f.commercial, amount: e.target.value },
                  }))
                }
              />
            </label>
            <label>
              Probabilidade (%)
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={won ? 100 : form.commercial.probability}
                disabled={won}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    commercial: {
                      ...f.commercial,
                      probability: e.target.value,
                    },
                  }))
                }
              />
            </label>
            <label>
              Contato
              <input
                maxLength={160}
                value={form.commercial.contact}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    commercial: { ...f.commercial, contact: e.target.value },
                  }))
                }
              />
            </label>
            <label className="crm-wide crm-opportunity-notes">
              Observações
              <textarea
                maxLength={10000}
                rows={2}
                value={form.notes}
                onChange={(e) => change("notes", e.target.value)}
              />
            </label>
          </div>
          <div className="crm-opportunity-save"><button className="button primary" type="submit">
            <Save size={16} aria-hidden="true" />{busy ? "Salvando…" : "Salvar oportunidade"}
          </button>{data.id&&data.status==='open'&&<button className="button" type="button" disabled={busy} onClick={()=>{if(window.confirm('Marcar esta oportunidade como perdida?'))void save('lost');}}><CircleX size={16} aria-hidden="true" />Marcar como perdida</button>}</div>
        </fieldset>
      </form>
      {error && (
        <ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>
      )}
      {data.id && (
        <>
          <section className="crm-opportunity-proposals" aria-label="Propostas vinculadas">
          <div className="crm-opportunity-proposals-heading"><div><h3>Propostas vinculadas <span>{data.proposals?.length || 0}</span></h3><p>Acompanhe as propostas desta oportunidade.</p></div>
          {!proposalOpen && <button type="button" className="button crm-add-proposal" disabled={busy || data.status !== "open" || form.customerId!==String(data.customer_id||'') || form.leadId!==String(data.lead_id||'')} onClick={() => setProposalOpen(true)}><Plus size={16} /> Adicionar proposta</button>}</div>
          <div className="crm-links">
            {data.proposals?.map((p: any) => (
              <article key={p.id}>
                <Link
                  className="crm-proposal-number"
                  title="Abrir e editar proposta"
                  href={"/crm/propostas/" + p.id}
                >
                  PROP-{p.number}
                </Link>
                <span className="crm-opportunity-proposal-title">{p.title}</span>
                <span className="crm-opportunity-proposal-status">{crmStatus(p.status)}</span>
                <strong className="crm-opportunity-proposal-total">{crmMoney(p.total_cents)}</strong>
              </article>
            ))}
          </div>
          {!data.proposals?.length && <p>Nenhuma proposta cadastrada.</p>}
          {proposalOpen && <form className="crm-opportunity-proposal-form"
            onSubmit={(e) => {
              e.preventDefault();
              void addProposal();
            }}
          >
            <fieldset disabled={busy || data.status !== "open"}>
              <legend>Nova proposta nesta oportunidade</legend>
              <p>
                Tipo de oportunidade:{" "}
                {
                  catalog.opportunityTypes.find(
                    (t: any) => String(t.id) === String(data.type_id),
                  )?.name
                }
              </p>
              <div className="crm-form-grid">
                <label>
                  Tipo de proposta *
                  <select
                    required
                    value={proposalType}
                    onChange={(e) => {
                      setProposalType(e.target.value);
                      proposalRequest.current = crypto.randomUUID();
                    }}
                  >
                    <option value="">Selecione</option>
                    {catalog.proposalTypes
                      .filter(
                        (t: any) =>
                          t.active &&
                          String(t.opportunity_type_id) ===
                            String(data.type_id),
                      )
                      .map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.code} · {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Título da proposta *
                  <input
                    required
                    maxLength={200}
                    value={proposalTitle}
                    onChange={(e) => {
                      setProposalTitle(e.target.value);
                      proposalRequest.current = crypto.randomUUID();
                    }}
                  />
                </label>
              </div>
              <button className="button primary" type="submit">
                <Plus size={16} />
                Criar proposta
              </button>
              <button type="button" className="button" onClick={() => setProposalOpen(false)}>Cancelar</button>
            </fieldset>
          </form>}
          </section>
          <details className="crm-opportunity-history">
            <summary>Histórico da oportunidade</summary>
            <ul className="crm-history">
              {data.history?.map((e: any) => (
                <li key={e.id}>
                  {eventLabel(e.action)} · {e.author} · {crmDate(e.created_at)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </dialog>,
    document.body,
  );
}
