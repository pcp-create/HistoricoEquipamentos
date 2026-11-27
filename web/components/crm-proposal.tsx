"use client";
import CrmProposalTiming from "./crm-proposal-timing";
import CrmProposalPdf from "./crm-proposal-pdf";
import CrmProposalDelivery from "./crm-proposal-delivery";
import CrmProposalEmail from "./crm-proposal-email";
import OrderDetailLink from "./order-detail-link";
import {canEditProposalReview} from "@/lib/crm/review-access";
import {CircleX,FileText,Send,ClipboardList,FilePenLine,ClipboardCheck,CheckCheck} from "lucide-react";
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
  const [paymentChoices,setPaymentChoices]=useState<any[]>([]);
  const [orderConfirmation,setOrderConfirmation]=useState({approver:"",notes:"",paymentConfirmed:false,payment:""});
  const [emailOpen,setEmailOpen]=useState(false);
  const [deliveryOpen,setDeliveryOpen]=useState(false);
  const [reviewOpen,setReviewOpen]=useState(false),[reviewer,setReviewer]=useState(''),[reviewComment,setReviewComment]=useState(''),[reviewUsers,setReviewUsers]=useState<any[]>([]);
  const [reviewPriceWarning,setReviewPriceWarning]=useState<any>(null),[productsFocus,setProductsFocus]=useState(0);
  const [choosingType,setChoosingType]=useState(false);
  const typeDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(choosingType)typeDialog.current?.showModal();},[choosingType]);
  const sending = useRef(false);
  async function load() {
    const [p, c] = await Promise.all([
      crmApi("?proposal=" + id),
      crmApi("?catalogs=1"),
    ]);
    if(['pending','converting'].includes(p.status)){
      try{
        const prices=await crmApi('',{action:'price-review',id,orderType:p.document.type||''});
        if(prices.minimumPrices)p.document={...p.document,items:p.document.items.map((item:any)=>item.kind==='material'&&prices.minimumPrices[item.code]!=null?{...item,quote:{key:`crm:${item.kind}:${item.code}`,kind:item.kind,code:item.code,name:item.name,unit:'',source:'Proposta comercial',referencePrice:'',lastPrice:'',referenceAt:'',quantity:item.quantity,price:item.price,selected:true,...item.quote,minimumPrice:String(prices.minimumPrices[item.code])}}:item)};
      }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar os mínimos do M8.');}
    }
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
      retry &&
      !window.confirm(
        "Confira a OS no M8. Itens com ID confirmado serão reaproveitados. Para etapas sem confirmação, confirme que não foram gravadas antes de continuar: reenviar uma etapa já gravada pode duplicá-la.",
      )
    )
      return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      if(!link){
        const review=await crmApi('',{action:'price-review',id,orderType:selectedType});
        if(review.items.length&&!review.approved){setError('Existem produtos abaixo do mínimo sem aprovação. Aprove os itens ou solicite a revisão da proposta antes de gerar a OS.');return;}
      }
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
              confirmation:orderConfirmation,
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
        <Link href="/crm?tab=proposals">Voltar às propostas</Link>
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
    locked = ['converting','won','lost','cancelled'].includes(data.status) || pending || ['sent','reviewed'].includes(data.workflow?.state) || (data.workflow?.state==='in_review' && !canEditProposalReview(data.workflow,data.currentUser,data.currentUserIsAdmin));
  const orderChoices=catalog.orderTypes.filter((t:any)=>t.active&&type?.order_types?.includes(String(t.id)));
  const cannotConvert=busy||changed||pending||!!data.emailAttempt||data.workflow?.state==='in_review'||data.status!=='pending'||!orderChoices.length;
  async function cancel() {
    if(!window.confirm('Cancelar esta proposta?'+(dirty?' As alterações não salvas serão descartadas.':'')))return;
    setBusy(true);setError('');
    try{await crmApi('',{action:'cancel-proposal',id,version:data.version});setDirty(false);await load();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const headerActions=<div className="crm-actions crm-proposal-top-actions">
    {data.status==='cancelled'&&<span className="crm-status">Proposta cancelada</span>}
    {data.priceRestorations?.map((r:any)=><div role="alert" key={r.id}><p>Produto {r.product_id}: restauração do mínimo R$ {Number(r.original_price).toFixed(2)} pendente. Confira o item no M8 antes de reenviar.</p>{data.currentUserIsAdmin&&<button type="button" className="button" disabled={busy} onClick={async()=>{setBusy(true);try{if(!window.confirm('Confira que a operação no M8 já terminou. Restaurar o mínimo original sem reenviar o produto?'))return;await crmApi('',{action:'restore-minimum',restorationId:r.id});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Restaurar mínimo do produto</button>}</div>)}
    {error&&<ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}
    {data.emailAttempt&&<div role="alert"><p>{data.emailAttempt.can_resolve?'Envio sem confirmação. Confira a pasta Enviados do Gmail antes de continuar.':'Envio em andamento. Aguarde e atualize a proposta.'}</p>{data.emailAttempt.can_resolve&&data.emailAttempt.actor===data.currentUser&&<><button type="button" disabled={busy} onClick={async()=>{if(!window.confirm('Confirma que encontrou o e-mail enviado no Gmail?'))return;setBusy(true);try{await crmApi('',{action:'resolve-proposal-email',id,attemptId:data.emailAttempt.id,resolution:'sent',confirmed:true});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Confirmei que foi enviado</button><button type="button" disabled={busy} onClick={async()=>{if(!window.confirm('Confirma que o e-mail não foi enviado? Isso permitirá uma nova tentativa.'))return;setBusy(true);try{await crmApi('',{action:'resolve-proposal-email',id,attemptId:data.emailAttempt.id,resolution:'not_sent',confirmed:true});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Confirmei que não foi enviado</button></>}</div>}
    {deliveryOpen&&<CrmProposalDelivery proposal={data} onClose={()=>setDeliveryOpen(false)} onEmail={()=>{setDeliveryOpen(false);setEmailOpen(true);}} onSent={load}/>}
    {emailOpen&&<ProposalDialog label="Enviar proposta ao cliente" onClose={()=>setEmailOpen(false)}><CrmProposalEmail proposal={data} onClose={()=>setEmailOpen(false)} onSent={load}/></ProposalDialog>}
    {choosingType&&<dialog ref={typeDialog} className="crm-order-type-dialog" aria-label="Confirmar Pedido de Venda" onCancel={()=>setChoosingType(false)}>
      <h2>Confirmar Pedido de Venda</h2>
      <p>Confira os dados antes de gerar a OS no M8.</p>
      <label>Tipo de OS a gerar<select aria-label="Tipo de OS a gerar" disabled={orderChoices.length<=1} value={conversionType} onChange={e=>setConversionType(e.target.value)}><option value="">Selecione o tipo de OS</option>{orderChoices.map((t:any)=><option key={t.id} value={String(t.id)}>{t.id} · {t.name}</option>)}</select></label>
      <div className="crm-order-confirmation-fields">
        <label>Condição de pagamento<select aria-label="Condição de pagamento" value={orderConfirmation.payment} onChange={e=>setOrderConfirmation(value=>({...value,payment:e.target.value,paymentConfirmed:false}))}><option value="">Selecione a condição de pagamento</option>{paymentChoices.map((payment:any)=><option key={payment.id} value={String(payment.id)}>{payment.name}</option>)}</select><small>A condição selecionada será salva na proposta ao confirmar o pedido.</small></label>
        <button type="button" className="crm-order-payment-switch" role="switch" aria-checked={orderConfirmation.paymentConfirmed} onClick={()=>setOrderConfirmation(value=>({...value,paymentConfirmed:!value.paymentConfirmed}))}><span className="crm-order-payment-toggle" aria-hidden="true"><span/></span><span>Confirmo a condição de pagamento acordada com o cliente</span></button>
        <label>Nome de quem aprovou o pedido *<input maxLength={160} value={orderConfirmation.approver} onChange={e=>setOrderConfirmation(value=>({...value,approver:e.target.value}))} placeholder="Nome do aprovador no cliente" required/></label>
        <label>Observações adicionais (opcional)<textarea rows={3} maxLength={2000} value={orderConfirmation.notes} onChange={e=>setOrderConfirmation(value=>({...value,notes:e.target.value}))}/></label>
      </div>
      <div className="crm-actions"><button type="button" className="button" onClick={()=>setChoosingType(false)}><CircleX size={16} aria-hidden="true"/>Cancelar</button><button type="button" className="button primary" disabled={cannotConvert||!orderConfirmation.paymentConfirmed||!orderConfirmation.approver.trim()||!paymentChoices.some((p:any)=>String(p.id)===orderConfirmation.payment)||!orderChoices.some((t:any)=>String(t.id)===conversionType)} onClick={()=>{setChoosingType(false);void convert(undefined,false,conversionType);}}><ClipboardList size={16} aria-hidden="true"/>Confirmar e gerar OS</button></div>
    </dialog>}
  </div>;
  const currentStage=data.status==='won'||data.status==='converting'?'order':data.workflow?.state||'creating';
  async function goStage(stage:string){
    setError('');
    if(busy)return;
    if(['won','lost','cancelled'].includes(data.status)){setError('Esta proposta está encerrada e não pode mudar de etapa.');return;}
    if(changed){setError('Salve a proposta antes de mudar de etapa.');return;}
    if(data.emailAttempt){setError('Aguarde a confirmação do envio de e-mail antes de mudar de etapa.');return;}
    if(stage==='in_review'){
      if(data.workflow?.state==='in_review'){setError('A proposta já está em revisão. Para finalizar, clique em Revisada.');return;}
      await openReview();return;
    }
    if(stage==='sent'){
      if(data.workflow?.state==='sent')return;
      setDeliveryOpen(true);return;
    }
    if(stage==='order'){
      if(data.status==='converting'){setError('A OS já está em processamento. Use Consultar / continuar envio no andamento da proposta.');return;}
      if(data.workflow?.state==='in_review'){setError('Conclua a revisão em andamento ou volte à criação antes de gerar a OS.');return;}
      if(!orderChoices.length){setError('Vincule um tipo de OS ativo ao tipo de proposta nas configurações.');return;}
      setBusy(true);
      try{
        const response=await fetch('/api/service-orders?lookup=metadata');
        const metadata=await response.json();
        if(!response.ok)throw Error(metadata.error||'Não foi possível carregar as condições de pagamento.');
        setPaymentChoices((metadata.registries||[]).filter((r:any)=>r.kind==='payment-terms'));
        setOrderConfirmation({approver:"",notes:"",paymentConfirmed:false,payment:String(data.document.payment||'')});
        setConversionType(orderChoices.length===1?String(orderChoices[0].id):orderType);
        setChoosingType(true);
      }catch(e){setError((e as Error).message);}finally{setBusy(false);}
      return;
    }
    if(stage===data.workflow?.state)return;
    if(stage==='reviewed'&&data.workflow?.state==='sent'){setError('Volte à criação para revisar novamente uma proposta enviada.');return;}
    if(stage==='reviewed'&&!window.confirm('Concluir Revisão?'))return;
    if(stage==='creating'&&!window.confirm('Voltar à criação para editar a proposta? A revisão atual será encerrada e os PDFs enviados serão preservados.'))return;
    setBusy(true);
    try{
      const result=await crmApi('',{action:stage==='creating'?'reopen_proposal':'complete_review',id,version:data.version});
      if(result.needsPriceApprovalConfirmation)setReviewPriceWarning(result);
      await load();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const stages=[{key:'creating',label:'Em criação',Icon:FilePenLine},{key:'in_review',label:'Em revisão',Icon:ClipboardCheck},{key:'reviewed',label:'Revisada',Icon:CheckCheck},{key:'sent',label:'Enviada ao cliente',Icon:Send},{key:'order',label:'Pedido de Venda',Icon:ClipboardList}];
  const stageActions=<section className="crm-proposal-stages" aria-label="Etapas da proposta">
    <nav aria-label="Alterar etapa da proposta">{stages.map(({key,label,Icon})=><button key={key} type="button" aria-current={currentStage===key?'step':undefined} disabled={busy||['won','lost','cancelled'].includes(data.status)} onClick={()=>void goStage(key)}><Icon size={17} aria-hidden="true"/><span>{label}</span></button>)}</nav>
  </section>;
  const actions = changed ? <p>Salve a proposta antes de concretizar ou gerar uma OS.</p> : null;
  const revisionEntry=(r:any)=><article key={r.revision}><a className="crm-revision-pdf" href={`/api/crm/pdf?id=${encodeURIComponent(id)}&revision=${r.revision}`} target="_blank" rel="noreferrer"><span className="crm-revision-pdf-icon" aria-hidden="true"><FileText size={18}/><span>PDF</span></span>Rev.{r.revision} · Abrir PDF enviado</a><p>{crmDate(r.sent_at)} · {r.sent_by_name || r.sent_by} · {r.recipients}</p></article>;
  const progress = <>
      <CrmProposalTiming proposal={data}/>
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
                  Conferi no M8 — continuar envio
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
      returnTo="/crm?tab=proposals"
      proposal={{
        id,
        leadId: data.lead_id,
        equipmentRequired: type?.equipment_required !== false,
        title: "Proposta comercial PROP-" + data.number + (data.workflow?.state&&data.workflow.state!=='creating'?` · Rev.${data.workflow.revision}`:''),
        name: title,
        opportunityLink:<Link className="crm-proposal-origin-link" href={`/crm?tab=opportunities&opportunity=${encodeURIComponent(data.opportunity_id)}`} aria-label={`Abrir oportunidade OP-${data.opportunity_number}`}>Oportunidade OP-{data.opportunity_number}</Link>,
        headerBottomActions:data.status==='pending'?<button type="button" className="button" disabled={busy||pending} onClick={()=>void cancel()}><CircleX size={16}/>Cancelar proposta</button>:null,
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
        canCompleteReview:false,
        stageActions,
        footerActions:<>{reviewOpen&&<ProposalDialog label="Enviar proposta para revisão" onClose={()=>setReviewOpen(false)}><h2>Enviar para revisão</h2><label>Funcionário<select value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Selecione</option>{reviewUsers.map((u:any)=><option key={u.email} value={u.email}>{u.display_name||u.name||u.email}</option>)}</select></label><label>Comentário<textarea value={reviewComment} maxLength={2000} onChange={e=>setReviewComment(e.target.value)}/></label><div className="crm-actions crm-review-dialog-actions"><button type="button" onClick={()=>setReviewOpen(false)}>Cancelar</button><button type="button" className="crm-review-dialog-submit" disabled={busy||!reviewer} onClick={()=>void requestReview()}>Enviar para revisão</button></div></ProposalDialog>}</>,
        tools,
        overviewActions:<CrmProposalPdf proposal={data} disabled={changed||busy} locked={locked} onSaved={load} onError={setError}/>,
        headerActions:<>{headerActions}{reviewPriceWarning&&<ProposalDialog label="Concluir revisão com preços pendentes" onClose={()=>setReviewPriceWarning(null)}><h2>{reviewPriceWarning.requiresPriceApproval?'Aprovações pendentes':'Deseja concluir a revisão?'}</h2><p>Possui {reviewPriceWarning.pendingCount} itens abaixo do mínimo ainda para aprovação.</p><div className="crm-actions"><button type="button" className="button" onClick={()=>{setReviewPriceWarning(null);setProductsFocus(n=>n+1);}}>Ir para produtos</button>{!reviewPriceWarning.requiresPriceApproval&&<button type="button" className="button primary" disabled={busy} onClick={async()=>{setBusy(true);try{await crmApi('',{action:'complete_review',id,version:reviewPriceWarning.version,allowUnapprovedPrices:true});setReviewPriceWarning(null);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Concluir revisão</button>}<button type="button" className="button" onClick={()=>setReviewPriceWarning(null)}>Cancelar</button></div></ProposalDialog>}</>,
        productsFocus,
        itemPriceApprovals:data.itemPriceApprovals||[],
        canApproveItemPrice:!!data.canApproveItemPrice&&['pending','converting'].includes(data.status)&&!busy,
        onApproveItem:async(draft,names,code)=>{
          setBusy(true);setError('');
          try{
            let version=data.version;
            if(!locked){const saved=await crmApi('',{action:'save-proposal',id,version,typeId:proposalType,title,status,draft,names});version=saved.version;}
            await crmApi('',{action:'approve-item-price',id,version,code});
          }catch(e){setError(e instanceof Error?e.message:'Não foi possível aprovar o item.');}finally{try{await load();setProductsFocus(n=>n+1);}finally{setBusy(false);}}
        },
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
        onSave: async (draft, names, completeReview) => {
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
          if(completeReview&&data.workflow?.state==='in_review')try{const result=await crmApi('',{action:'complete_review',id,version:saved.version});if(result.needsPriceApprovalConfirmation)setReviewPriceWarning(result);}catch(e){await load();throw e;}
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
