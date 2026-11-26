"use client";
import CrmProposalPdf from "./crm-proposal-pdf";
import CrmProposalEmail from "./crm-proposal-email";
import OrderDetailLink from "./order-detail-link";
import CrmEmailSettings from "./crm-email-settings";
import {FileText,Settings} from "lucide-react";
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
  const [emailOpen,setEmailOpen]=useState(false);
  const [emailSettings,setEmailSettings]=useState<any>(null),[settingsOpen,setSettingsOpen]=useState(false);
  useEffect(()=>{let active=true;crmApi('?proposalEmailSettings=1').then(value=>{if(active)setEmailSettings(value);}).catch(()=>{});return()=>{active=false;};},[]);
  const [reviewOpen,setReviewOpen]=useState(false),[reviewer,setReviewer]=useState(''),[reviewComment,setReviewComment]=useState(''),[reviewUsers,setReviewUsers]=useState<any[]>([]);
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
  async function requestReview(){
    setBusy(true);setError('');
    try{await crmApi('',{action:'request_review',id,version:data.version,reviewer,comment:reviewComment});setReviewOpen(false);setReviewer('');setReviewComment('');await load();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function openReview(){
    setError('');
    try{const r=await fetch('/api/service-orders?lookup=metadata');const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível carregar funcionários.');setReviewUsers(d.users||[]);setReviewOpen(true);}
    catch(e){setError((e as Error).message);}
  }
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
    changed = (!['sent','reviewed'].includes(data.workflow?.state) && dirty) || title !== data.title || status !== data.status || proposalType!==String(data.type_id);
  const pending = data.links.some(
      (l: any) => !["complete", "validation_failed"].includes(l.state),
    ),
    locked = ['converting','won','lost','cancelled'].includes(data.status) || pending || ['sent','reviewed'].includes(data.workflow?.state) || (data.workflow?.state==='in_review' && data.workflow.reviewer!==data.currentUser);
  const orderChoices=catalog.orderTypes.filter((t:any)=>t.active&&type?.order_types?.includes(String(t.id)));
  const cannotConvert=busy||changed||pending||!!data.emailAttempt||!['reviewed','sent'].includes(data.workflow?.state)||data.status!=='pending'||!orderChoices.length;
  const headerActions=<div className="crm-actions">
    {error&&<ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}
    {data.emailAttempt&&<div role="alert"><p>{data.emailAttempt.can_resolve?'Envio sem confirmação. Confira a pasta Enviados do Gmail antes de continuar.':'Envio em andamento. Aguarde e atualize a proposta.'}</p>{data.emailAttempt.can_resolve&&data.emailAttempt.actor===data.currentUser&&<><button type="button" disabled={busy} onClick={async()=>{if(!window.confirm('Confirma que encontrou o e-mail enviado no Gmail?'))return;setBusy(true);try{await crmApi('',{action:'resolve-proposal-email',id,attemptId:data.emailAttempt.id,resolution:'sent',confirmed:true});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Confirmei que foi enviado</button><button type="button" disabled={busy} onClick={async()=>{if(!window.confirm('Confirma que o e-mail não foi enviado? Isso permitirá uma nova tentativa.'))return;setBusy(true);try{await crmApi('',{action:'resolve-proposal-email',id,attemptId:data.emailAttempt.id,resolution:'not_sent',confirmed:true});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Confirmei que não foi enviado</button></>}</div>}
    {emailSettings&&<button type="button" className="button" onClick={()=>setSettingsOpen(true)}><Settings size={16}/> Configurações</button>}
    {settingsOpen&&<CrmEmailSettings initial={emailSettings} onClose={()=>setSettingsOpen(false)} onSaved={setEmailSettings}/>}
    <CrmProposalPdf proposal={data} disabled={changed||busy} locked={locked} onSaved={load} onError={setError}/>
    {data.workflow?.state==='reviewed'&&<button type="button" className="button primary" disabled={busy||changed||!!data.emailAttempt} onClick={()=>setEmailOpen(true)}>Enviar ao cliente</button>}
    {emailOpen&&<ProposalDialog label="Enviar proposta ao cliente" onClose={()=>setEmailOpen(false)}><CrmProposalEmail proposal={data} onClose={()=>setEmailOpen(false)} onSent={load}/></ProposalDialog>}
    {data.status==='pending'&&<button type="button" className="button primary" disabled={cannotConvert} title={changed?"Salve a proposta antes de gerar o pedido.":!['reviewed','sent'].includes(data.workflow?.state)?"Conclua a revisão antes de gerar o pedido.":undefined} onClick={()=>{
      if(orderChoices.length===1)void convert(undefined,false,String(orderChoices[0].id));
      else {setConversionType('');setChoosingType(true);}
    }}>{busy?'Processando…':'Pedido de Venda (Gerar OS)'}</button>}
    {choosingType&&<dialog ref={typeDialog} className="crm-order-type-dialog" aria-label="Selecionar tipo de ordem de serviço" onCancel={()=>setChoosingType(false)}>
      <h2>Pedido de Venda (Gerar OS)</h2>
      <label>Tipo de OS a gerar<select aria-label="Tipo de OS a gerar" value={conversionType} onChange={e=>setConversionType(e.target.value)}><option value="">Selecione o tipo de OS</option>{orderChoices.map((t:any)=><option key={t.id} value={String(t.id)}>{t.id} · {t.name}</option>)}</select></label>
      <div className="crm-actions"><button type="button" onClick={()=>setChoosingType(false)}>Cancelar</button><button type="button" className="button primary" disabled={cannotConvert||!orderChoices.some((t:any)=>String(t.id)===conversionType)} onClick={()=>{setChoosingType(false);void convert(undefined,false,conversionType);}}>Gerar OS</button></div>
    </dialog>}
  </div>;
  const actions = changed ? <p>Salve a proposta antes de concretizar ou gerar uma OS.</p> : null;
  const revisionEntry=(r:any)=><article key={r.revision}><a className="crm-revision-pdf" href={`/api/crm/pdf?id=${encodeURIComponent(id)}&revision=${r.revision}`} target="_blank" rel="noreferrer"><span className="crm-revision-pdf-icon" aria-hidden="true"><FileText size={18}/><span>PDF</span></span>Rev.{r.revision} · Abrir PDF enviado</a><p>{crmDate(r.sent_at)} · {r.sent_by_name || r.sent_by} · {r.recipients}</p></article>;
  const progress = <>
      {!!data.sentRevisions?.length&&<section className="crm-links"><h3>Revisões enviadas</h3>{revisionEntry(data.sentRevisions[0])}{data.sentRevisions.length>1&&<details className="crm-previous-revisions"><summary>Ver todas as revisões</summary><div>{data.sentRevisions.slice(1).map(revisionEntry)}</div></details>}</section>}
      {data.links.some((l:any)=>l.state!=='validation_failed') && (
        <div className="crm-links">
          <h3>Ordens de serviço e envios vinculados</h3>
          {data.links.filter((l:any)=>l.state!=='validation_failed').map((l: any) => (
            <article key={l.id}>
              <span className={"crm-status crm-status-" + l.state}>
                {crmStatus(l.state)}
              </span>
              {l.order_id && (
                <>
                  {" "}
                  ·{" "}
                  <OrderDetailLink id={String(l.order_id)} company={l.company_id}>
                    OS-{l.order_id}
                  </OrderDetailLink>
                </>
              )}
              <p>
                {crmDate(l.created_at)} · {l.actor_name || l.actor}
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
          <input readOnly value={data.status==='won'?'Concretizada':({creating:'Em criação',in_review:'Em revisão',reviewed:'Revisada',sent:'Enviada ao cliente'} as Record<string,string>)[data.workflow?.state]||crmStatus(data.status)}/>
        </label>
        {validityControl}
      </div>
      {data.workflow?.state!=='creating'&&data.workflow?.revision!=null&&<p className="crm-info">Revisão {data.workflow.revision}{data.workflow.reviewed_by&&data.workflow.reviewed_at?` · Revisada por ${data.workflow.reviewed_name || data.workflow.reviewed_by} em ${crmDate(data.workflow.reviewed_at)}`:''}</p>}
      {(pending||data.status==='converting') && (
        <p className="crm-info">
          Existe um envio de OS pendente. Consulte ou conclua o andamento da OS
          antes de editar esta proposta.
        </p>
      )}
      {data.workflow?.state==='sent'&&data.status!=='won'&&<p className="crm-info">A revisão enviada está bloqueada. Solicite nova revisão para alterar a proposta.</p>}
      {data.status === "won" && <p className="crm-info">O pedido de venda foi gerado e a proposta está concluída.</p>}
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
        id,
        leadId: data.lead_id,
        equipmentRequired: type?.equipment_required !== false,
        title: "Proposta comercial PROP-" + data.number + (data.workflow?.state&&data.workflow.state!=='creating'?` · Rev.${data.workflow.revision}`:''),
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
        saveLabel:data.workflow?.state==='in_review'?'Concluir revisão':undefined,
        footerActions:<>{data.status==='pending'&&['creating','reviewed','sent'].includes(data.workflow?.state||'creating')&&<button type="button" className="primary" disabled={busy||changed||pending} onClick={()=>void openReview()}>{data.workflow?.state==='creating'?'Enviar para revisão':'Revisar proposta'}</button>}{reviewOpen&&<ProposalDialog label="Enviar proposta para revisão" onClose={()=>setReviewOpen(false)}><h2>Enviar para revisão</h2><label>Funcionário<select value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Selecione</option>{reviewUsers.map((u:any)=><option key={u.email} value={u.email}>{u.display_name||u.name||u.email}</option>)}</select></label><label>Comentário<textarea value={reviewComment} maxLength={2000} onChange={e=>setReviewComment(e.target.value)}/></label><div className="crm-actions crm-review-dialog-actions"><button type="button" onClick={()=>setReviewOpen(false)}>Cancelar</button><button type="button" className="crm-review-dialog-submit" disabled={busy||!reviewer} onClick={()=>void requestReview()}>Enviar para revisão</button></div></ProposalDialog>}</>,
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
          const saved=await crmApi("", {
            action: "save-proposal",
            typeId:proposalType,
            id,
            version: data.version,
            title,
            status,
            draft,
            names,
          });
          if(data.workflow?.state==='in_review')try{await crmApi('',{action:'complete_review',id,version:saved.version});}catch(e){await load();throw e;}
          await load();
        },
      }}
    />
  );
}
function ProposalDialog({label,onClose,children}:{label:string;onClose:()=>void;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className="crm-dialog crm-proposal-flow-dialog" aria-label={label} onCancel={e=>{e.preventDefault();onClose();}}>{children}</dialog>;
}
