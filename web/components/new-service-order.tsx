"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, RefreshCw, Plus } from "lucide-react";
import SiteHeader from "./site-header";
import OrderSearchSelect from "./order-search-select";
import CurrencyInput from "./currency-input";
import QuoteCatalogPicker from "./quote-catalog-picker";
import type { QuoteItem } from "@/lib/quotes/types";

import { type OrderDraft, parseOrder } from "@/lib/service-orders/model";
import { companyName } from "@/lib/company-names";
import "./new-service-order.css";
import { extraFields } from "@/lib/service-orders/extra-fields";
const blank = (): OrderDraft => ({
  company: "",
  type: "",
  customer: "",
  equipment: "",
  serviceType: "",
  origin: "",
  seller: "",
  technician: "",
  payment: "",
  expected: "",
  delivery: "",
  situation: "",
  flowStatus: "",
  freight: "",
  notes: "",
  internalNotes: "",
  items: [],
});
const stateNames: Record<string, string> = {
  ready: "Pronto para continuar",
  sending: "Aguardando confirmação",
  partial: "Envio pendente",
  uncertain: "Conferência no M8 necessária",
  complete: "OS criada",
  rejected: "Cadastro recusado pelo M8",
};
async function api(body?: unknown, query = "") {
  const r = await fetch("/api/service-orders" + query, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
export default function NewServiceOrder({
  editing,
}: { editing?: { company: string; id: string } } = {}) {
  const [noteEditor, setNoteEditor] = useState<{index:number; field:"notes"|"internalNotes"; text:string}|null>(null);
  const [catalogKind, setCatalogKind] = useState<QuoteItem["kind"] | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const router = useRouter();
  const [form, setForm] = useState<OrderDraft>(blank),
    [meta, setMeta] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("header"),
    [names, setNames] = useState({ customer: "", equipment: "" }),
    [sellers, setSellers] = useState<any[]>([]),
    [sellerBusy, setSellerBusy] = useState(false),
    [sellerError, setSellerError] = useState(""),
    [recent, setRecent] = useState<any[]>([]),
    [current, setCurrent] = useState<any>(null),
    [clock, setClock] = useState("");
  const sending = useRef(false),
    requestId = useRef<string | null>(null),
    active = Boolean(
      current && !["rejected", "complete"].includes(current.state),
    );
  const disabled = busy || active || Boolean(editing && !editData);
  const set = (key: keyof OrderDraft, value: string) => {
    setError("");
    setForm((f) => ({ ...f, [key]: value }));
  };
  async function load() {
    try {
      if (editing) {
        const [m, d] = await Promise.all([
          api(undefined, "?lookup=metadata"),
          api(
            undefined,
            "?edit=1&company=" + editing.company + "&order=" + editing.id,
          ),
        ]);
        setMeta(m);
        setEditData(d);
        setForm(d.draft);
        setNames(d.names);
        setError("");
        const pending = sessionStorage.getItem(
          "edit-service-order-" + editing.company + "-" + editing.id,
        );
        if (pending) {
          requestId.current = pending;
          try {
            const status = await api(undefined, "?editStatus=" + pending);
            if (status.state === "complete") {
              sessionStorage.removeItem(
                "edit-service-order-" + editing.company + "-" + editing.id,
              );
              requestId.current = null;
            } else {
              setCurrent(status);
              if (status.draft) setForm(status.draft);
            }
          } catch {
            sessionStorage.removeItem(
              "edit-service-order-" + editing.company + "-" + editing.id,
            );
            requestId.current = null;
          }
        }
        return;
      }
      const [m, r] = await Promise.all([
        api(undefined, "?lookup=metadata"),
        api(),
      ]);
      setMeta(m);
      setRecent(r.rows);
      const saved = sessionStorage.getItem("new-service-order-submission");
      if (saved) {
        requestId.current = saved;
        const found = r.rows.find((r: any) => r.id === saved);
        if (found) setCurrent(found);
        else {
          const response = await api(
            undefined,
            "?id=" + encodeURIComponent(saved),
          );
          if (response.rows[0]) setCurrent(response.rows[0]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }
  useEffect(() => {
    void load();
    const update = () =>
      setClock(
        new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setSellers([]);
    setSellerError("");
    if (!form.customer || !form.company) {
      setSellerBusy(false);
      return;
    }
    setSellerBusy(true);
    fetch(
      "/api/service-orders?" +
        new URLSearchParams({
          lookup: "sellers",
          customer: form.customer,
          company: form.company,
        }),
      { signal: c.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        setSellers(d.rows);
        const defaults = d.rows.filter((r: any) => r.default);
        const chosen =
          defaults.length === 1
            ? defaults[0]
            : d.rows.length === 1
              ? d.rows[0]
              : null;
        setForm((f) =>
          editing && f.customer === editData?.draft.customer
            ? f
            : { ...f, seller: chosen?.id || "" },
        );
        if (!d.rows.length)
          setSellerError(
            "Cliente sem vendedor cadastrado no M8. Atualize o cadastro do cliente para continuar.",
          );
      })
      .catch((e) => {
        if (!c.signal.aborted) setSellerError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setSellerBusy(false);
      });
    return () => c.abort();
  }, [form.company, form.customer]);
  const registry = (kind: string) =>
    (meta?.registries || []).filter((r: any) => r.kind === kind);
  const service = registry("service-types").find(
      (r: any) => r.id === form.serviceType,
    ),
    type = meta?.types.find((r: any) => r.id === form.type);
  async function advance(id: string) {
    let r;
    do {
      r = await api({ action: editing ? "edit-advance" : "advance", id });
      setCurrent(r);
    } while (r.state === "ready");
    if (r.state === "complete") {
      if (editing) {
        sessionStorage.removeItem(
          "edit-service-order-" + editing.company + "-" + editing.id,
        );
        requestId.current = null;
      }
      router.replace(
        `/historico?createdCompany=${r.company}&createdOrder=${r.m8Id}`,
      );
    }
    if (r.state !== "complete")
      setError(
        r.message || "O envio está pendente. Confira o andamento abaixo.",
      );
    return r;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    setError("");
    try {
      parseOrder(form, Boolean(editing));
    } catch (e) {
      setTab("header");
      setError(e instanceof Error ? e.message : "Confira os campos.");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const id = requestId.current || crypto.randomUUID();
      requestId.current = id;
      sessionStorage.setItem(
        editing
          ? "edit-service-order-" + editing.company + "-" + editing.id
          : "new-service-order-submission",
        id,
      );
      const prepared = await api(
        editing
          ? {
              action: "edit-prepare",
              id,
              company: editing.company,
              order: editing.id,
              version: editData.version,
              draft: form,
            }
          : { action: "prepare", id, draft: form },
      );
      setCurrent(prepared);
      await advance(id);
      if (!editing) setRecent((await api()).rows);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Falha no envio. Consulte os envios recentes.",
      );
      try {
        if (requestId.current) {
          const r = await api(
            undefined,
            editing
              ? "?editStatus=" + requestId.current
              : "?id=" + requestId.current,
          );
          if (editing) setCurrent(r);
          else if (r.rows[0]) setCurrent(r.rows[0]);
        }
      } catch {}
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }
  async function resume(id: string) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    requestId.current = id;
    sessionStorage.setItem(
      editing
        ? "edit-service-order-" + editing.company + "-" + editing.id
        : "new-service-order-submission",
      id,
    );
    try {
      await advance(id);
      if (!editing) setRecent((await api()).rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }
  function reset() {
    requestId.current = null;
    sessionStorage.removeItem(
      editing
        ? "edit-service-order-" + editing.company + "-" + editing.id
        : "new-service-order-submission",
    );
    setCurrent(null);
    setError("");
  }
  function choose(field: "type" | "customer" | "company", value: string) {
    setError("");
    setForm((f) => ({
      ...f,
      [field]: value,
      ...(field === "company"
        ? { customer: "", seller: "", equipment: "" }
        : field === "customer"
          ? { seller: "", equipment: "" }
          : { equipment: "" }),
    }));
    setNames((n) => ({
      ...n,
      ...(field === "company"
        ? { customer: "", equipment: "" }
        : { equipment: "" }),
    }));
  }
  const select = (
    key: keyof OrderDraft,
    label: string,
    options: any[],
    extra?: string,
  ) => (
    <label>
      <span className="os-field-title">
        {label}{" "}
        {key !== "technician" &&
          (!editing ||
            ["type", "customer", "payment", "seller"].includes(key)) && (
            <b>*</b>
          )}
      </span>
      <OrderSearchSelect
        label={label}
        value={String(form[key])}
        options={(editing &&
        form[key] &&
        !options.some((r) => String(r.id) === String(form[key]))
          ? [
              ...options,
              {
                id: String(form[key]),
                name: editData?.labels?.[key] || "Valor atual no M8",
              },
            ]
          : options
        )
          .sort((a, b) => Number(a.id) - Number(b.id))
          .map((r) => ({
            ...r,
            detail: key === "technician" ? "" : `ID ${r.id}`,
          }))}
        onChange={(r) =>
          key === "type" ? choose("type", r.id) : set(key, r.id)
        }
      />
      {extra && <small>{extra}</small>}
    </label>
  );
  return (
    <>
      <SiteHeader active="history" />
      <main className="new-os">
        <Link href="/historico" className="os-back">
          <ArrowLeft size={16} /> Ordens de Serviço
        </Link>
        <header>
          <div>
            <h1>
              {editing
                ? "Editar OS " + (editData?.number || "")
                : "Nova Ordem de Serviço"}
            </h1>
            <p>
              {editing
                ? "Revise os dados e salve as alterações na ordem existente."
                : "Cadastre a ordem no M8 com seus produtos e serviços."}
            </p>
          </div>
          <div>
            <Link href="/configuracoes/cadastros">Cadastros auxiliares</Link>
            {editing && (
              <button
                type="button"
                disabled={busy || active}
                onClick={() => {
                  requestId.current = null;
                  setCurrent(null);
                  sessionStorage.removeItem(
                    "edit-service-order-" + editing.company + "-" + editing.id,
                  );
                  void load();
                }}
              >
                Recarregar OS
              </button>
            )}
          </div>
        </header>
        {!meta && (
          <p>
            Carregando cadastros…{" "}
            <button type="button" onClick={() => void load()}>
              Tentar novamente
            </button>
          </p>
        )}
        {editing && editData?.missing?.length > 0 && (
          <p className="os-edit-notice">
            Alguns campos, como origem, frete, garantia e observações internas,
            não são retornados pelo M8. Eles ficam em branco e só são enviados
            se você os preencher.
          </p>
        )}
        {error && (
          <p role="alert" className="os-error">
            {error}
          </p>
        )}
        {current && (
          <section className="os-result" aria-live="polite">
            <strong>
              {editing && current.state === "complete"
                ? "OS atualizada"
                : stateNames[current.state]}
            </strong>
            <p>
              Empresa {companyName(String(current.company))}
              {current.m8Id ? ` · ID M8 da OS: ${current.m8Id}` : ""} ·{" "}
              {current.nextItem}/{current.itemCount} etapas confirmadas
            </p>
            {current.message && <p>{current.message}</p>}
            {current.state === "complete" && (
              <p>
                A ordem foi gravada no ERP. A lista de Ordens de Serviço será
                atualizada pelo integrador.
              </p>
            )}
            {["sending", "uncertain"].includes(current.state) && (
              <p>
                A resposta não está confirmada. Confira a OS no ERP antes de
                realizar um novo envio.
              </p>
            )}
            {["ready", "partial"].includes(current.state) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void resume(current.id)}
              >
                Concluir envio da OS
              </button>
            )}
            {["rejected", "complete"].includes(current.state) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  reset();
                  if (current.state === "complete" && !editing) {
                    setForm(blank());
                    setNames({ customer: "", equipment: "" });
                  }
                }}
              >
                {current.state === "complete"
                  ? "Cadastrar outra OS"
                  : "Corrigir os dados"}
              </button>
            )}
          </section>
        )}
        <form onSubmit={submit} noValidate>
          <fieldset
            disabled={
              disabled ||
              !meta ||
              current?.state === "complete" ||
              current?.state === "rejected"
            }
            className="os-form-fields"
          >
            <div className="os-company">
              <label>
                <span className="os-field-title">
                  Empresa <b>*</b>
                </span>
                <OrderSearchSelect
                  label="Empresa"
                  disabled={Boolean(editing)}
                  value={form.company}
                  placeholder="Selecione a empresa para cadastrar"
                  options={["1", "2", "27404"].map((id) => ({
                    id,
                    name: companyName(id),
                  }))}
                  onChange={(r) => choose("company", r.id)}
                />
              </label>
              <span>
                {editing
                  ? "Empresa da OS existente."
                  : "A OS será criada na empresa selecionada."}
              </span>
            </div>
            <nav className="os-tabs" aria-label="Dados da nova OS">
              {[
                ["header", "Cabeçalho"],
                ["material", "Produtos"],
                ["service", "Serviços"],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={tab === key}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key)}
                >
                  {label}
                  {key !== "header" &&
                    ` (${form.items.filter((i) => i.kind === key).length})`}
                </button>
              ))}
            </nav>
            <fieldset disabled={!form.company} className="os-form-fields">
              <div hidden={tab !== "header"}>
                <div className="os-grid">
                  {select("type", "Tipo Ordem de Serviço", meta?.types || [])}
                  <label>
                    <span className="os-field-title">
                      Cliente <b>*</b>
                    </span>
                    <OrderSearchSelect
                      label="Cliente"
                      value={form.customer}
                      selectedLabel={names.customer}
                      endpoint="/api/service-orders?lookup=customers"
                      placeholder="Selecione o cliente"
                      onChange={(r) => {
                        choose("customer", r.id);
                        setNames({ customer: r.name, equipment: "" });
                      }}
                    />
                  </label>
                  <label>
                    <span className="os-field-title">
                      Equipamento {!editing && <b>*</b>}
                    </span>
                    <OrderSearchSelect
                      label="Equipamento"
                      value={form.equipment}
                      selectedLabel={names.equipment}
                      disabled={!form.customer || !form.type}
                      endpoint={
                        "/api/service-orders?" +
                        new URLSearchParams({
                          lookup: "equipment",
                          customer: form.customer,
                          type: form.type,
                        })
                      }
                      placeholder="Selecione o equipamento"
                      onChange={(r) => {
                        set("equipment", r.id);
                        setNames((n) => ({ ...n, equipment: r.name }));
                      }}
                    />
                    <small>
                      {type?.customer_equipment_only === true
                        ? "Somente equipamentos do cliente"
                        : type?.customer_equipment_only === false
                          ? "Todos os equipamentos cadastrados"
                          : "Selecione um tipo de OS atualizado"}
                    </small>
                  </label>
                  {select(
                    "serviceType",
                    "Tipo Atendimento",
                    registry("service-types"),
                  )}
                  {select(
                    "origin",
                    "Origem Atendimento",
                    registry("service-origins"),
                  )}
                  {select(
                    "seller",
                    "Vendedor",
                    sellers,
                    sellerBusy
                      ? "Consultando vendedor do cliente…"
                      : sellerError ||
                          "Preenchido pelo vendedor padrão do cliente. Se houver vários sem padrão, selecione.",
                  )}
                  {select(
                    "payment",
                    "Condição de Pagamento",
                    registry("payment-terms"),
                  )}
                  <label>
                    <span className="os-field-title">
                      Data Abertura <b>*</b>
                    </span>
                    <input readOnly value={clock.split(",")[0] || ""} />
                  </label>
                  <label>
                    <span className="os-field-title">
                      Hora Abertura <b>*</b>
                    </span>
                    <input readOnly value={clock.split(",")[1]?.trim() || ""} />
                    <small>Horário de Brasília, atualizado no envio.</small>
                  </label>
                  <label>
                    <span className="os-field-title">
                      Data Entrega Prevista <b>*</b>
                    </span>
                    <input
                      required
                      type="date"
                      value={form.expected}
                      onChange={(e) => set("expected", e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="os-field-title">
                      Data Entrega <b>*</b>
                    </span>
                    <input
                      required
                      type="date"
                      value={form.delivery}
                      onChange={(e) => set("delivery", e.target.value)}
                    />
                  </label>
                  {select(
                    "situation",
                    "Situação Ordem Serviço",
                    registry("order-statuses"),
                  )}
                  {select(
                    "flowStatus",
                    "Status Fluxo",
                    registry("flow-statuses"),
                    "Aplicado após a criação da OS e a inclusão do equipamento, produtos e serviços.",
                  )}
                  {select("freight", "Frete", registry("freight"))}
                  <label>
                    <span className="os-field-title">
                      Prazo Garantia {!editing && <b>*</b>}
                    </span>
                    <input
                      readOnly
                      value={service?.warranty_description || ""}
                      placeholder="Definido pelo tipo de atendimento"
                    />
                  </label>
                  <label className="os-wide">
                    <span className="os-field-title">
                      Observações {!editing && <b>*</b>}
                    </span>
                    <textarea
                      required={!editing}
                      maxLength={20000}
                      rows={4}
                      value={form.notes}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </label>
                  <label className="os-wide">
                    <span className="os-field-title">
                      Observações Internas {!editing && <b>*</b>}
                    </span>
                    <textarea
                      required={!editing}
                      maxLength={20000}
                      rows={4}
                      value={form.internalNotes}
                      onChange={(e) => set("internalNotes", e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <details className="os-extra" hidden={tab !== "header"}>
                <summary>Outras informações (opcionais)</summary>
                <p>
                  Preencha somente quando aplicável. Campos de ID devem
                  corresponder aos cadastros do M8.
                </p>
                <div className="os-grid">
                  {select(
                    "technician",
                    "Técnico",
                    [
                      { id: "", name: "Não atribuído" },
                      ...(editing &&
                      form.technician.startsWith("m8:") &&
                      editData?.technicianOption
                        ? [editData.technicianOption]
                        : []),
                      ...(meta?.users || []).map((u: any) => ({
                        id: u.email,
                        displayId: u.m8_employee_id
                          ? String(u.m8_employee_id)
                          : "",
                        name:
                          (u.name && u.name !== u.email
                            ? u.name
                            : "Técnico sem nome cadastrado") +
                          (u.m8_employee_id ? "" : " — ID M8 não configurado"),
                        disabled: !u.m8_employee_id,
                      })),
                    ],
                    "Configure o ID M8 do técnico na Administração > Funcionários.",
                  )}
                  {extraFields.map((field) => (
                    <label key={field.key}>
                      <span className="os-field-title">{field.label}</span>
                      {field.type === "select" ? (
                        <OrderSearchSelect
                          label={field.label}
                          value={form.extra?.[field.key] || ""}
                          placeholder="Padrão do M8"
                          options={[
                            { id: "", name: "Padrão do M8" },
                            ...(field.options || [])
                              .filter(
                                (id) =>
                                  !editing ||
                                  field.key !== "status" ||
                                  id !== "Processado",
                              )
                              .map((id) => ({
                                id,
                                name: id,
                              })),
                          ]}
                          onChange={(r) =>
                            setForm((f) => ({
                              ...f,
                              extra: { ...f.extra, [field.key]: r.id },
                            }))
                          }
                        />
                      ) : (
                        <input
                          type={field.type}
                          min={field.type === "number" ? 0 : undefined}
                          max={field.type === "number" ? 2147483647 : undefined}
                          maxLength={2000}
                          value={form.extra?.[field.key] || ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              extra: {
                                ...f.extra,
                                [field.key]: e.target.value,
                              },
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </details>
              {["material", "service"].map((kind) => (
                <div key={kind} hidden={tab !== kind}>
                  <div className="os-item-heading">
                    <h2>
                      {kind === "material" ? "Produtos" : "Serviços"} da OS
                    </h2>
                  </div>
                  <div className="os-items">
                    <table>
                      <thead>
                        <tr>
                          <th>Código / descrição</th>
                          <th>Quantidade</th>
                          <th>Valor unitário</th>
                          <th>Total</th>
                          {kind === "service" && <><th>Observação</th><th>Observação interna</th></>}
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map(
                          (item, index) =>
                            item.kind === kind && (
                              <tr key={kind + (item.id || item.code)}>
                                <td>
                                  {item.code} · {item.name}

                                </td>
                                {(["quantity", "price"] as const).map(
                                  (field) => (
                                    <td key={field}>
                                      {field === "price" ? <CurrencyInput label="Valor unitário" value={item.price} onChange={price=>setForm(f=>({...f,items:f.items.map((v,i)=>i===index?{...v,price}:v)}))}/> : <input
                                        aria-label={
                                          field === "quantity"
                                            ? "Quantidade"
                                            : "Valor unitário"
                                        }
                                        inputMode="decimal"
                                        value={item[field]}
                                        onChange={(e) =>
                                          setForm((f) => ({
                                            ...f,
                                            items: f.items.map((v, i) =>
                                              i === index
                                                ? {
                                                    ...v,
                                                    [field]:
                                                      e.target.value.replace(
                                                        ",",
                                                        ".",
                                                      ),
                                                  }
                                                : v,
                                            ),
                                          }))
                                        }
                                      />}
                                    </td>
                                  ),
                                )}
                                <td>
                                  {(
                                    Number(item.price) *
                                      Number(item.quantity) || 0
                                  ).toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </td>
                                {kind === "service" && (["notes", "internalNotes"] as const).map(field => (
                                  <td key={field}>
                                    <button type="button" className="os-note-preview"
                                      aria-label={`${field === "notes" ? "Observação" : "Observação interna"}: ${item.name}`}
                                      onClick={() => setNoteEditor({index, field, text:item[field] ?? ""})}>
                                      {item[field] || "+ Adicionar"}
                                    </button>
                                  </td>
                                ))}
                                <td>
                                  <button
                                    type="button"
                                    aria-label={"Remover " + item.name}
                                    onClick={() =>
                                      setForm((f) => ({
                                        ...f,
                                        items: f.items.filter(
                                          (_, i) => i !== index,
                                        ),
                                      }))
                                    }
                                  >
                                    <Trash2 size={17} />
                                  </button>
                                </td>
                              </tr>
                            ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  {!form.items.some((i) => i.kind === kind) && (
                    <p>
                      Nenhum {kind === "material" ? "produto" : "serviço"}{" "}
                      incluído.
                    </p>
                  )}
                  <button type="button" className="secondary-button os-add-item" disabled={disabled} onClick={()=>setCatalogKind(kind as QuoteItem["kind"])}>
                    <Plus size={16} /> {kind === "material" ? "Adicionar Produto" : "Adicionar Serviço"}
                  </button>
                </div>
              ))}
            </fieldset>
          </fieldset>
          <footer className="os-submit">
            <p>
              Os campos marcados com * são obrigatórios. Produtos e serviços
              podem ser incluídos conforme a necessidade.
            </p>
            <button
              className="primary"
              disabled={
                disabled ||
                !meta ||
                sellerBusy ||
                !form.company ||
                Boolean(current)
              }
            >
              <Save size={18} />
              {busy
                ? editing
                  ? "Salvando no M8…"
                  : "Criando no M8…"
                : editing
                  ? "Salvar alterações"
                  : "Criar OS no M8"}
            </button>
          </footer>
        </form>
        <details className="os-recent" hidden={Boolean(editing)}>
          <summary>Meus envios recentes</summary>
          <button type="button" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={15} /> Atualizar andamento
          </button>
          {recent.map((r) => (
            <div key={r.id}>
              <span>
                {new Date(r.createdAt).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}{" "}
                · {companyName(String(r.company))} · {stateNames[r.state]}
                {r.m8Id ? ` · ID M8 ${r.m8Id}` : ""} · {r.nextItem}/
                {r.itemCount} itens
              </span>
              {["ready", "partial"].includes(r.state) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void resume(r.id)}
                >
                  Continuar envio
                </button>
              )}
            </div>
          ))}
        </details>
        {noteEditor && <ServiceNoteDialog
          title={noteEditor.field === "notes" ? "Observação" : "Observação interna"}
          service={form.items[noteEditor.index].name}
          value={noteEditor.text}
          onClose={() => setNoteEditor(null)}
          onSave={text => {
            setForm(f => ({...f, items:f.items.map((item,index) => index === noteEditor.index ? {...item,[noteEditor.field]:text} : item)}));
            setNoteEditor(null);
          }}
        />}
        {catalogKind && <QuoteCatalogPicker
          kind={catalogKind}
          historyContext={catalogKind === "material" ? {customer:form.customer,equipment:form.equipment} : undefined}
          existing={new Set(form.items.map(item=>`${item.kind}:${item.code.trim()}`))}
          onClose={()=>setCatalogKind(null)}
          onAdd={item=>setForm(previous=>previous.items.some(existing=>existing.kind===item.kind && existing.code===item.code) ? previous : {
            ...previous,
            items:[...previous.items,{kind:item.kind,code:item.code,name:item.name,quantity:item.quantity || "1",price:item.price || item.referencePrice || "0"}],
          })}
        />}
      </main>
    </>
  );
}

function ServiceNoteDialog({title,service,value,onClose,onSave}:{title:string;service:string;value:string;onClose:()=>void;onSave:(text:string)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text,setText] = useState(value);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="os-note-dialog" aria-labelledby="os-note-title" onCancel={onClose}>
    <header><h2 id="os-note-title">{title}</h2><button type="button" onClick={onClose}>Fechar</button></header>
    <p>{service}</p>
    <label><span>{title}</span><textarea autoFocus rows={10} maxLength={20000} value={text} onChange={event=>setText(event.target.value)} /></label>
    <footer><button type="button" onClick={onClose}>Cancelar</button><button type="button" className="primary" onClick={()=>onSave(text)}>Salvar observação</button></footer>
  </dialog>;
}
