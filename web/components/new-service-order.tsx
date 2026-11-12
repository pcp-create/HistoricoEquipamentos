"use client";
import EquipmentWarrantyAlert from "./equipment-warranty-alert";
import EquipmentCreateDialog from "./equipment-create-dialog";
import OrderAttachments,{sendOrderAttachments} from "./order-attachments";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, RefreshCw, Plus } from "lucide-react";
import SiteHeader from "./site-header";
import OrderSearchSelect from "./order-search-select";
import OrderDeliveryHistory from "./order-delivery-history";
import CurrencyInput from "./currency-input";
import QuoteCatalogPicker from "./quote-catalog-picker";
import type { QuoteItem } from "@/lib/quotes/types";

import { type OrderDraft, parseOrder, equipmentOptionalForOrderType } from "@/lib/service-orders/model";
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
  editing, returnTo,
}: { returnTo?: string; editing?: { company: string; id: string } } = {}) {
  const [addingEquipment,setAddingEquipment]=useState(false);
  const [equipmentPending,setEquipmentPending]=useState(false);
  const [attachmentFiles,setAttachmentFiles]=useState<File[]>([]);
  const [attachmentBusy,setAttachmentBusy]=useState(false);
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
    [openedAt, setOpenedAt] = useState("");
  const openingRequestTime=useRef("");
  const sending = useRef(false),
    requestId = useRef<string | null>(null),
    active = Boolean(
      current && !["rejected", "complete"].includes(current.state),
    );
  const disabled = busy || attachmentBusy || active || Boolean(editing && !editData);
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
  useEffect(() => { void load(); }, []);
  const openingDate=editing?editData?.openingDate||'':openedAt?new Date(openedAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
  const openingTime=editing?editData?.openingTime||'':openedAt?new Date(openedAt).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour12:false}):'';
  useEffect(()=>{if(!editing&&current?.openedAt)setOpenedAt(current.openedAt);},[current?.openedAt]);
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
        if(c.signal.aborted)return;
        setSellers(d.rows);
        const defaults = d.rows.filter((r: any) => r.default);
        const chosen = Object.hasOwn(d,"defaultSellerId")
          ? d.rows.find((r:any)=>r.id===d.defaultSellerId)
          : defaults.length === 1
            ? defaults[0]
            : d.rows.length === 1
              ? d.rows[0]
              : null;
        setForm((f) =>
          editing && f.customer === editData?.draft.customer
            ? f
            : { ...f, seller: chosen?.id || "" },
        );
        if(!d.rows.some((r:any)=>!r.disabled))setSellerError("Nenhum vendedor habilitado disponível no M8.");
        else if(d.warning)setSellerError(d.warning);
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
  async function advance(id: string, files = attachmentFiles) {
    let r;
    do {
      r = await api({ action: editing ? "edit-advance" : "advance", id });
      setCurrent(r);
    } while (r.state === "ready");
    if (r.state === "complete") {
      try{await sendOrderAttachments(String(r.company||form.company),String(editing?.id||r.m8Id),files,file=>setAttachmentFiles(files=>files.filter(f=>f!==file)));}
      catch(e){throw Error('A OS foi salva no ERP, mas há anexos pendentes. Não crie a OS novamente. '+(e as Error).message);}
      if (editing) {
        sessionStorage.removeItem(
          "edit-service-order-" + editing.company + "-" + editing.id,
        );
        requestId.current = null;
      }
      router.replace(
        returnTo ? returnTo + (r.localSynced === false ? "&sync=pending" : "") : `/historico?createdCompany=${r.company}&createdOrder=${r.m8Id}`,
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
    if (sending.current||attachmentBusy) return;
    setError("");
    try {
      parseOrder(form, Boolean(editing),!equipmentOptionalForOrderType(form.type,type?.equipment_required));
      if (editing && editData && form.expected !== editData.draft.expected && !form.deliveryChangeReason?.trim())
        throw new Error("Informe a justificativa da alteração da entrega prevista.");
    } catch (e) {
      setTab("header");
      setError(e instanceof Error ? e.message : "Confira os campos.");
      return;
    }
    if(!editing&&!openingRequestTime.current){openingRequestTime.current=new Date().toISOString();setOpenedAt(openingRequestTime.current);}
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
          : { action: "prepare", id, draft: form, openedAt: openingRequestTime.current },
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
  async function retry(submission: any) {
    if (sending.current || attachmentBusy) return;
    const message = submission.m8Id
      ? `Confira a OS ${submission.m8Id} no M8. Confirma que a etapa pendente não foi gravada? Somente essa etapa e as seguintes serão reenviadas, usando os dados salvos. Uma etapa já gravada poderá ser duplicada.`
      : "Confirma que conferiu no M8 e esta OS não foi criada? O sistema tentará criar novamente usando todos os dados salvos. Se a OS já existir, poderá ser duplicada.";
    if (!window.confirm(message)) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const files = requestId.current === submission.id ? attachmentFiles : [];
      const prepared = await api({ action: "retry", id: submission.id, updatedAt: submission.updatedAt, confirmed: true });
      setCurrent(prepared);
      if (requestId.current !== submission.id) setAttachmentFiles([]);
      requestId.current = submission.id;
      sessionStorage.setItem("new-service-order-submission", submission.id);
      await advance(submission.id, files);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível reprocessar o envio.");
    } finally {
      try { setRecent((await api()).rows); } catch {}
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
    if(!editing){setOpenedAt("");openingRequestTime.current="";}
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
        {key !== "technician" && key !== "origin" &&
          (!editing ||
            ["type", "customer", "payment", "seller"].includes(key)) && (
            <b>*</b>
          )}
      </span>
      <OrderSearchSelect
        label={label}
        value={String(form[key])}
        disabled={key==="seller"&&(sellerBusy||!form.customer)}
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
            detail: key === "technician" ? "" : key === "seller" ? r.detail || `ID ${r.id}` : `ID ${r.id}`,
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
        <Link href={returnTo || "/historico"} className="os-back">
          <ArrowLeft size={16} /> {returnTo ? "Voltar às vendas" : "Ordens de Serviço"}
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
        <OrderAttachments company={String(editing?.company||current?.company||form.company)} order={editing?.id||(current?.state==='complete'?String(current.m8Id):undefined)} files={attachmentFiles} onFilesChange={setAttachmentFiles} disabled={busy||active} onBusy={setAttachmentBusy}/>
        {current?.state==='complete'&&<Link href={`/historico?createdCompany=${current.company}&createdOrder=${editing?.id||current.m8Id}`}>Ver OS salva</Link>}
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
            {!editing && ["uncertain", "rejected"].includes(current.state) && (
              <button type="button" disabled={busy || attachmentBusy} onClick={() => void retry(current)}>
                <RefreshCw size={15} /> Tentar novamente
              </button>
            )}
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
                disabled={busy||attachmentBusy||(current.state==='complete'&&attachmentFiles.length>0)}
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
                        choose("customer", r.id);setEquipmentPending(false);
                        setNames({ customer: r.name, equipment: "" });
                      }}
                    />
                  </label>
                  <label>
                    <span className="os-field-title">
                      Equipamento {!equipmentOptionalForOrderType(form.type,type?.equipment_required) && <b>*</b>}
                    </span>
                    <div className="os-equipment-create-row">
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
                      placeholder={equipmentOptionalForOrderType(form.type,type?.equipment_required) ? "Equipamento opcional" : "Selecione o equipamento"}
                      onChange={(r) => {
                        set("equipment", r.id);setEquipmentPending(!!r.data?.integrationPending);
                        setNames((n) => ({ ...n, equipment: r.name }));
                      }}
                    />
                    {equipmentOptionalForOrderType(form.type,type?.equipment_required)&&form.equipment&&<button type="button" disabled={disabled} onClick={()=>{set('equipment','');setNames(names=>({...names,equipment:''}));setEquipmentPending(false);}}>Sem equipamento</button>}
                    <button type="button" className="os-add-equipment" aria-label="Cadastrar equipamento" title="Cadastrar equipamento" disabled={!form.customer||!form.type} onClick={()=>setAddingEquipment(true)}><Plus size={18}/></button></div>
                    {equipmentOptionalForOrderType(form.type,type?.equipment_required)&&<small>Equipamento opcional conforme a configuração do tipo de OS.</small>}
                    {equipmentPending&&<small className="ws-integration-pending">Vínculo com cliente pendente de integração</small>}
                    <small>
                      {type?.customer_equipment_only === true
                        ? "Somente equipamentos do cliente"
                        : type?.customer_equipment_only === false
                          ? "Todos os equipamentos cadastrados"
                          : "Selecione um tipo de OS atualizado"}
                    </small>
                  </label>
                  <div className="os-warranty-notice"><EquipmentWarrantyAlert equipmentId={form.equipment} company={editing?.company} orderId={editing?.id}/></div>
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
                          "Preenchido pelo padrão do cliente, quando disponível. Clique para selecionar ou trocar o vendedor.",
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
                    <input readOnly value={openingDate} placeholder={editing?"Não informada":"Definida ao criar a OS"} />
                  </label>
                  <label>
                    <span className="os-field-title">
                      Hora Abertura <b>*</b>
                    </span>
                    <input readOnly value={openingTime} placeholder={editing?"Não informada":"Definida ao criar a OS"} />
                    <small>Horário de Brasília. A data e a hora de abertura são fixas após a criação.</small>
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
                  {editing && editData && form.expected !== editData.draft.expected && <label>Justificativa da alteração da entrega prevista <b>*</b><textarea required maxLength={2000} value={form.deliveryChangeReason || ""} onChange={e => set("deliveryChangeReason", e.target.value)}/></label>}
                  {editing && <OrderDeliveryHistory company={editing.company} order={editing.id}/>}
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
                      Observações Internas
                    </span>
                    <textarea
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
                  {editing&&<>
                    <p>Itens existentes são somente para consulta. Somente inclusões e exclusões serão enviadas ao M8.</p>
                    <p>A aprovação é consultada no M8. A API ainda não permite alterar essa aprovação e não informa o campo para serviços. Faça a alteração no ERP e reabra a edição para consultar o resultado.</p>
                  </>}
                  <div className="os-items">
                    <table>
                      <thead>
                        <tr>
                          <th>Código / descrição</th>
                          {editing && <th>Aprovação</th>}
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
                                {editing && <td>
                                  <span className={`os-item-approval os-item-approval-${item.approval || "unknown"}`}>
                                    {!item.id ? "Novo item" : item.approval === "approved" ? "Aprovado" : item.approval === "rejected" ? "Reprovado" : "Não informado"}
                                  </span>
                                </td>}
                                {(["quantity", "price"] as const).map(
                                  (field) => (
                                    <td key={field}>
                                      {editing&&item.id?<input aria-label={field==='quantity'?'Quantidade':'Valor unitário'} readOnly value={field==='price'?Number(item.price).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):item.quantity} title="Item existente: remova e inclua novamente para alterar."/>:field === "price" ? <CurrencyInput label="Valor unitário" value={item.price} onChange={price=>setForm(f=>({...f,items:f.items.map((v,i)=>i===index?{...v,price}:v)}))}/> : <input
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
              {["uncertain", "rejected"].includes(r.state) && (
                <button type="button" disabled={busy || attachmentBusy} onClick={() => void retry(r)}>
                  <RefreshCw size={15} /> Tentar novamente
                </button>
              )}
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
          readOnly={Boolean(editing&&form.items[noteEditor.index].id)}
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
      {addingEquipment&&<EquipmentCreateDialog source="service-order" customer={{id:"m8:"+form.customer,name:names.customer}} onClose={()=>setAddingEquipment(false)} onCreated={equipment=>{set("equipment",equipment.id);setNames(n=>({...n,equipment:equipment.name}));setEquipmentPending(!!equipment.integrationPending);setAddingEquipment(false);}}/>}
    </>
  );
}

function ServiceNoteDialog({title,service,value,onClose,onSave,readOnly=false}:{title:string;service:string;value:string;onClose:()=>void;onSave:(text:string)=>void;readOnly?:boolean}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text,setText] = useState(value);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="os-note-dialog" aria-labelledby="os-note-title" onCancel={onClose}>
    <header><h2 id="os-note-title">{title}</h2><button type="button" onClick={onClose}>Fechar</button></header>
    <p>{service}</p>
    <label><span>{title}</span><textarea readOnly={readOnly} autoFocus rows={10} maxLength={20000} value={text} onChange={event=>setText(event.target.value)} /></label>
    <footer><button type="button" onClick={onClose}>Cancelar</button>{!readOnly&&<button type="button" className="primary" onClick={()=>onSave(text)}>Salvar observação</button>}</footer>
  </dialog>;
}
