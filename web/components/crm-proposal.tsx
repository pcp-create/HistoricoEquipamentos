"use client";
import CrmProposalPdf from "./crm-proposal-pdf";
import ActionNotice from "./action-notice";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NewServiceOrder from "./new-service-order";
import { crmApi, crmStatus, crmDate } from "./crm-api";
import "./crm.css";
export default function CrmProposal({ id }: { id: string }) {
  const [data, setData] = useState<any>(null),
    [catalog, setCatalog] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [title, setTitle] = useState(""),
    [status, setStatus] = useState("pending"),
    [orderType, setOrderType] = useState(""),
    [proposalType,setProposalType]=useState("");
  const [conversionType,setConversionType]=useState("");
  const [choosingType,setChoosingType]=useState(false);
  const typeDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(choosingType)typeDialog.current?.showModal();},[choosingType]);
  const sending = useRef(false);
  async function load() {
    const [p, c] = await Promise.all([
      crmApi("?proposal=" + id),
      crmApi("?catalogs=1"),
    ]);
    setData(p);
    setCatalog(c);
    setTitle(p.title);
    setStatus(p.status);
    setProposalType(String(p.type_id));
    setOrderType(p.document.type || "");
    setDirty(false);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [id]);
  async function convert(link?: any, retry = false, selectedType = orderType) {
    if (sending.current) return;
    if (
      !link &&
      !window.confirm(
        data.status === "won"
          ? "Gerar outra OS vinculada a esta proposta?"
          : "Concretizar a proposta e criar a OS no M8 com os dados salvos?",
      )
    )
      return;
    if (
      retry &&
      !window.confirm(
        "Confira a OS no M8. Confirma que a etapa pendente não foi gravada? Somente a etapa pendente e as seguintes serão reenviadas. Uma etapa já gravada poderá ser duplicada.",
      )
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      let result = await crmApi(
        "",
        link
          ? {
              action: retry ? "retry" : "advance",
              id: link.id,
              confirmed: retry,
              updatedAt: link.submission_updated_at,
            }
          : {
              action: "convert",
              id: crypto.randomUUID(),
              proposalId: id,
              version: data.version,
              additional: data.status === "won",
              orderType: selectedType,
            },
      );
      // Only explicit ready states advance. An uncertain result always needs human ERP verification.
      while (result.state === "ready")
        result = await crmApi("", { action: "advance", id: result.linkId });
      if (result.state !== "complete")
        setError(
          result.message ||
            "A criação da OS está pendente. Consulte o andamento da OS.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      try {
        await load();
      } catch (e) {
        setError((e as Error).message);
      }
      sending.current = false;
      setBusy(false);
    }
  }
  if (!data || !catalog)
    return (
      <main className="main">
        <Link href="/crm">Voltar ao CRM</Link>
        {error ? <ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice> : <p>Carregando proposta…</p>}
      </main>
    );
  const type = catalog.proposalTypes.find(
      (t: any) => String(t.id) === proposalType,
    ),
    changed = dirty || title !== data.title || status !== data.status || proposalType!==String(data.type_id);
  const pending = data.links.some(
      (l: any) => !["complete", "validation_failed"].includes(l.state),
    ),
    locked = data.status === "converting" || pending;
  const orderChoices=catalog.orderTypes.filter((t:any)=>t.active&&type?.order_types?.includes(String(t.id)));
  const cannotConvert=busy||changed||pending||!["pending","won"].includes(data.status)||!orderChoices.length;
  const headerActions=<div className="crm-actions">
    {error&&<ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}
    <CrmProposalPdf proposal={data} disabled={changed||busy} locked={locked} onSaved={load} onError={setError}/>
    <button type="button" className="button primary" disabled={cannotConvert} title={changed?"Salve a proposta antes de gerar o pedido.":undefined} onClick={()=>{
      if(orderChoices.length===1)void convert(undefined,false,String(orderChoices[0].id));
      else {setConversionType('');setChoosingType(true);}
    }}>{busy?'Processando…':'Pedido de Venda (Gerar OS)'}</button>
    {choosingType&&<dialog ref={typeDialog} className="crm-order-type-dialog" aria-label="Selecionar tipo de ordem de serviço" onCancel={()=>setChoosingType(false)}>
      <h2>Pedido de Venda (Gerar OS)</h2>
      <label>Tipo de OS a gerar<select aria-label="Tipo de OS a gerar" value={conversionType} onChange={e=>setConversionType(e.target.value)}><option value="">Selecione o tipo de OS</option>{orderChoices.map((t:any)=><option key={t.id} value={String(t.id)}>{t.id} · {t.name}</option>)}</select></label>
      <div className="crm-actions"><button type="button" onClick={()=>setChoosingType(false)}>Cancelar</button><button type="button" className="button primary" disabled={cannotConvert||!orderChoices.some((t:any)=>String(t.id)===conversionType)} onClick={()=>{setChoosingType(false);void convert(undefined,false,conversionType);}}>Gerar OS</button></div>
    </dialog>}
  </div>;
  const actions = changed ? <p>Salve a proposta antes de concretizar ou gerar uma OS.</p> : null;
  const progress = <>
      {!!data.links.length && (
        <div className="crm-links">
          <h3>Ordens de serviço e envios vinculados</h3>
          {data.links.map((l: any) => (
            <article key={l.id}>
              <span className={"crm-status crm-status-" + l.state}>
                {crmStatus(l.state)}
              </span>
              {l.order_id && (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={`/historico?createdCompany=${l.company_id}&createdOrder=${l.order_id}`}
                  >
                    OS-{l.order_id}
                  </Link>
                </>
              )}
              <p>
                {crmDate(l.created_at)} · {l.actor}
              </p>
              {l.message && <p>{l.message}</p>}
              {["preparing", "ready", "partial", "sending"].includes(
                l.state,
              ) && (
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void convert(l)}
                >
                  Consultar / continuar envio
                </button>
              )}
              {["uncertain", "rejected"].includes(l.state) && (
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void convert(l, true)}
                >
                  Conferi no M8 — tentar etapa novamente
                </button>
              )}
            </article>
          ))}
        </div>
      )}
  </>;
  const tools = (validityControl: React.ReactNode) => (
    <section className="crm-proposal-tools crm-proposal-identity" aria-label="Situação da proposta">
      <div className="crm-proposal-section-heading"><h3>Informações gerais</h3><p>Identificação e acompanhamento da proposta.</p></div>
      <p className="crm-proposal-opportunity">
        <span>Oportunidade</span>
        <Link href={"/crm?opportunity=" + data.opportunity_id}>
          OP-{data.opportunity_number} · {data.customer_name}
        </Link>{" "}
        · {type?.code} · {type?.name}
      </p>
      <div className="crm-form-grid">
        <label>
          Título da proposta
          <input
            maxLength={200}
            value={title}
            disabled={busy || locked}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Status da proposta
          <select
            value={status}
            disabled={busy || locked || data.status === "won"}
            onChange={(e) => setStatus(e.target.value)}
          >
            {(locked || data.status === "won"
              ? [data.status]
              : ["pending", "lost", "cancelled"]
            ).map((s) => (
              <option key={s} value={s}>
                {crmStatus(s)}
              </option>
            ))}
          </select>
        </label>
        {validityControl}
      </div>
      {locked && (
        <p className="crm-info">
          Existe um envio de OS pendente. Consulte ou conclua o andamento da OS
          antes de editar esta proposta.
        </p>
      )}
      {data.status === "won" && (
        <p className="crm-info">
          Você pode editar esta proposta. As alterações ficam no CRM e não
          modificam as OSs já geradas.
        </p>
      )}
      {!type?.order_types?.length && (
        <p className="crm-info">
          Este tipo de proposta ainda não tem um ID de tipo de OS configurado.{" "}
          <Link href="/configuracoes/cadastros/crm">Definir nos cadastros</Link>
          .
        </p>
      )}
    </section>
  );
  return (
    <NewServiceOrder
      key={data.version}
      returnTo="/crm"
      proposal={{
        title: "Proposta comercial PROP-" + data.number,
        name: title,
        createdAt: data.created_at,
        typeName: type ? `${type.code} · ${type.name}` : "",
        draft: data.document,
        names: data.names,
        orderTypes: type?.order_types || [],
        orderType,
        typeControl:<label><span className="os-field-title">Tipo de proposta <b>*</b></span><select aria-label="Tipo de proposta" disabled={busy||locked} value={proposalType} onChange={e=>{
          const selected=catalog.proposalTypes.find((t:any)=>String(t.id)===e.target.value);setProposalType(e.target.value);
          if(!selected?.order_types?.includes(orderType))setOrderType('');
        }}>{catalog.proposalTypes.filter((t:any)=>String(t.opportunity_type_id)===String(data.opportunity_type_id)&&(t.active||String(t.id)===proposalType)).map((t:any)=><option key={t.id} value={String(t.id)}>{t.code} · {t.name}</option>)}</select></label>,
        locked: locked || busy,
        tools,
        headerActions,
        activityTools: progress,
        summaryTools: actions && (
          <section
            className="crm-proposal-tools crm-conversion-tools"
            aria-label="Ações da proposta"
          >
            {actions}
          </section>
        ),
        onDirty: setDirty,
        onSave: async (draft, names) => {
          await crmApi("", {
            action: "save-proposal",
            typeId:proposalType,
            id,
            version: data.version,
            title,
            status,
            draft,
            names,
          });
          await load();
        },
      }}
    />
  );
}
