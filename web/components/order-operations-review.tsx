"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import OperationReviewWindow from "./operation-review-window";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { statusNames } from "@/lib/service-scheduling/model";

export default function OrderOperationsReview({data,busy,error,mutate,onClose,dirtyOperations}:any) {
  const operations = [...(data.operations || [])].sort((a,b)=>Number(a.position)-Number(b.position));
  const [selected,setSelected] = useState<string>(operations[0]?.id || '');
  const dialog=useRef<HTMLDialogElement>(null);
  const sections=useRef(new Map<string,HTMLDivElement>());
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
    if(pendingEdits.current.size&&!window.confirm('Descartar as correções não salvas e fechar a revisão?'))return;
    dirtyOperations.delete(dirtyKey);onClose();
  };
  const trackScroll=()=>{
    const top=dialog.current!.getBoundingClientRect().top;
    const header=dialog.current!.querySelector('.order-review-heading')!.getBoundingClientRect().height;
    let active=operations[0]?.id;
    for(const o of operations){if((sections.current.get(o.id)?.getBoundingClientRect().top??Infinity)<=top+header+32)active=o.id;}
    if(active)setSelected(active);
  };
  return createPortal(<dialog ref={dialog} className="scheduling-page operation-review-window order-review-continuous" aria-label="Revisar operações da OS" onScroll={trackScroll} onCancel={e=>{e.preventDefault();close();}}>
    <header className="operation-review-header order-review-heading">
      <div><h2>Revisar operações da OS</h2><p>{operations.length} operações · {operations.filter(o=>o.status==='awaiting_review').length} aguardando revisão · {operations.filter(o=>['reviewed','completed'].includes(o.status)).length} revisadas</p>
        <label>Operação em revisão <select aria-label="Ir para operação" value={selected} onChange={e=>{setSelected(e.target.value);sections.current.get(e.target.value)?.scrollIntoView({block:'start'});}}>
          {operations.map(o=><option key={o.id} value={o.id}>Operação {operationNumber(o.position)} · {statusNames[o.status]}</option>)}
        </select></label>
      </div>
      <button type="button" aria-label="Fechar revisão" disabled={busy} onClick={close}><X size={20}/></button>
    </header>
    {operations.map(o=><div key={o.id} ref={el=>{if(el)sections.current.set(o.id,el);else sections.current.delete(o.id);}} className="order-review-operation">
      <OperationReviewWindow embedded operation={o} data={data} busy={busy} dirty={false} error={error} mutate={mutate} onClose={close}
        onReportDirty={(value:boolean)=>{if(value)pendingEdits.current.add(o.id);else pendingEdits.current.delete(o.id);if(pendingEdits.current.size)dirtyOperations.add(dirtyKey);else dirtyOperations.delete(dirtyKey);}}/>
    </div>)}
  </dialog>,document.body);
}
