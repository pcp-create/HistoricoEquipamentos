"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCheck, AlertTriangle } from "lucide-react";
import ChecklistAlertReview, {type AlertTaskDraft} from "./checklist-alert-review";
import {orderChecklistAlerts,orderAlertDocument,orderReviewSignature,orderReviewBlockReason} from "@/lib/service-scheduling/order-review";
import {pendingChecklistAlerts,validateAlertTaskGroups} from "@/lib/service-scheduling/checklist-alerts";
import ActionNotice from "./action-notice";
import OperationReviewWindow from "./operation-review-window";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { statusNames } from "@/lib/service-scheduling/model";

export default function OrderOperationsReview({data,busy,error,mutate,onClose,dirtyOperations}:any) {
  const operations = [...(data.operations || [])].sort((a,b)=>Number(a.position)-Number(b.position));
  const [selected,setSelected] = useState<string>(operations[0]?.id || '');
  const [tab,setTab]=useState("operations");
  const [alertTasks,setAlertTasks]=useState<AlertTaskDraft[]>([]);
  const alerts=orderChecklistAlerts(operations), alertDocument=orderAlertDocument(operations,data.orderReview);
  const pending=pendingChecklistAlerts(alertDocument,alerts);
  const allReviewed=operations.length>0&&operations.every(o=>["reviewed","completed"].includes(o.status));
  const concluded=!orderReviewBlockReason(operations,data.orderReview);
  let invalidTasks=false;
  try{validateAlertTaskGroups(pending,alertTasks);}catch{invalidTasks=true;}
  const dialog=useRef<HTMLDialogElement>(null);
  const sections=useRef(new Map<string,HTMLDivElement>());
  const [hasPendingEdits,setHasPendingEdits]=useState(false);
  const pendingEdits=useRef(new Set<string>());
  const dirtyKey='order-operations-review';
  useEffect(()=>{
    const element=dialog.current!;
    const overflow=document.body.style.overflow;
    element.showModal();document.body.style.overflow='hidden';
    return ()=>{element.close();document.body.style.overflow=overflow;dirtyOperations.delete(dirtyKey);};
  },[dirtyOperations]);
  const close=()=>{
    if(busy)return;
    if((pendingEdits.current.size||alertTasks.length)&&!window.confirm('Descartar as correções não salvas e fechar a revisão?'))return;
    dirtyOperations.delete(dirtyKey);onClose();
  };
  const trackScroll=()=>{
    if(tab!=="operations")return;
    const top=dialog.current!.getBoundingClientRect().top;
    const header=dialog.current!.querySelector('.order-review-heading')!.getBoundingClientRect().height;
    let active=operations[0]?.id;
    for(const o of operations){if((sections.current.get(o.id)?.getBoundingClientRect().top??Infinity)<=top+header+32)active=o.id;}
    if(active)setSelected(active);
  };
  return createPortal(<dialog ref={dialog} className="scheduling-page operation-review-window order-review-continuous" aria-label="Revisar operações da OS" onScroll={trackScroll} onCancel={e=>{e.preventDefault();close();}}>
    <header className="operation-review-header order-review-heading">
      <div><h2>Revisar operações da OS</h2><p>{operations.length} operações · {operations.filter(o=>o.status==='awaiting_review').length} aguardando revisão · {operations.filter(o=>['reviewed','completed'].includes(o.status)).length} revisadas</p>
        {tab==="operations"&&<label>Operação em revisão <select aria-label="Ir para operação" value={selected} onChange={e=>{setSelected(e.target.value);sections.current.get(e.target.value)?.scrollIntoView({block:'start'});}}>
          {operations.map(o=><option key={o.id} value={o.id}>Operação {operationNumber(o.position)} · {statusNames[o.status]}</option>)}
        </select></label>}
      </div>
      <button type="button" aria-label="Fechar revisão" disabled={busy} onClick={close}><X size={20}/></button>
    </header>
    {error&&<ActionNotice type="error">{error}</ActionNotice>}
    <nav className="operation-review-tabs order-review-tabs" aria-label="Revisão da OS">
      <button type="button" aria-pressed={tab==='operations'} onClick={()=>setTab('operations')}>Operações</button>
      <button type="button" className={pending.length?'review-tab-alerts':undefined} aria-pressed={tab==='alerts'} onClick={()=>setTab('alerts')}><AlertTriangle size={16}/>Alertas da OS ({alerts.length})</button>
    </nav>
    <div hidden={tab!=="operations"}>
    {operations.map(o=><div key={o.id} ref={el=>{if(el)sections.current.set(o.id,el);else sections.current.delete(o.id);}} className="order-review-operation">
      <OperationReviewWindow embedded operation={o} data={data} busy={busy} dirty={false} error={error} mutate={mutate} onClose={close}
        onReportDirty={(value:boolean)=>{if(value)pendingEdits.current.add(o.id);else pendingEdits.current.delete(o.id);setHasPendingEdits(pendingEdits.current.size>0);if(pendingEdits.current.size)dirtyOperations.add(dirtyKey);else if(!alertTasks.length)dirtyOperations.delete(dirtyKey);}}/>
    </div>)}
    </div>
    <section hidden={tab!=="alerts"} className="order-review-alert-panel">
      <ChecklistAlertReview scope="order" alerts={alerts} document={alertDocument} editable={data.canEditSettings&&!concluded} busy={busy||hasPendingEdits} users={data.users||[]} value={alertTasks} onChange={value=>{setAlertTasks(value);if(value.length||pendingEdits.current.size)dirtyOperations.add(dirtyKey);else dirtyOperations.delete(dirtyKey);}}/>
    </section>
    <footer className="operation-review-footer order-review-finalize">
      {concluded?<strong>Revisão da OS concluída. Exportação do relatório liberada.</strong>:<>
        {!allReviewed&&<span>Conclua a revisão de todas as operações antes de finalizar a revisão da OS.</span>}
        {pending.length>0&&<span>{pending.length} alerta(s) aguardando atribuição na aba Alertas da OS.</span>}
        {data.canEditSettings&&<button type="button" disabled={busy||!allReviewed||invalidTasks||hasPendingEdits} onClick={async()=>{const saved=await mutate({action:'order_review',signature:orderReviewSignature(operations),alertTasks});if(saved){setAlertTasks([]);dirtyOperations.delete(dirtyKey);}}}><CheckCheck size={16}/>Concluir revisão da OS</button>}
      </>}
    </footer>
  </dialog>,document.body);
}
