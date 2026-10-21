"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import OperationReviewWindow from "./operation-review-window";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { statusNames } from "@/lib/service-scheduling/model";

export default function OrderOperationsReview({data,busy,error,mutate,onClose,dirtyOperations}:any) {
  const operations = [...(data.operations || [])].sort((a,b)=>Number(a.position)-Number(b.position));
  const [selected,setSelected] = useState<string>(() => (operations.find(o=>o.status==='awaiting_review') || operations[0])?.id || '');
  const reportDirty = useRef(false);
  const dirtyKey = 'order-operations-review';
  useEffect(()=>()=>{dirtyOperations.delete(dirtyKey);},[dirtyOperations]);
  const index = Math.max(0,operations.findIndex(o=>o.id===selected));
  const operation = operations[index];
  if (!operation) return null;
  const pending = operations.filter(o=>o.status==='awaiting_review');
  const reviewed = operations.filter(o=>['reviewed','completed'].includes(o.status));
  const changeOperation = (id:string) => {
    if (busy || id===operation.id) return;
    if (reportDirty.current && !window.confirm('Descartar as correções não salvas e mudar de operação?')) return;
    reportDirty.current=false;dirtyOperations.delete(dirtyKey);setSelected(id);
  };
  return <OperationReviewWindow key={operation.id} operation={operation} data={data} busy={busy} dirty={false} error={error} mutate={mutate} onClose={onClose}
    onReportDirty={(value:boolean)=>{reportDirty.current=value;if(value)dirtyOperations.add(dirtyKey);else dirtyOperations.delete(dirtyKey);}}
    navigation={<section className="order-operations-review-nav" aria-label="Operações da OS">
      <div className="order-operations-review-summary"><div><h3>Revisar operações da OS</h3><p>{operations.length} operações · {pending.length} aguardando revisão · {reviewed.length} revisadas</p></div>
        <div className="order-operations-review-controls">
          <button type="button" disabled={busy||index===0} onClick={()=>changeOperation(operations[index-1].id)}><ChevronLeft size={16}/>Anterior</button>
          <span>{index+1} de {operations.length}</span>
          <button type="button" disabled={busy||index===operations.length-1} onClick={()=>changeOperation(operations[index+1].id)}>Próxima<ChevronRight size={16}/></button>
        </div>
      </div>
      <nav className="order-operations-review-list" aria-label="Selecionar operação para revisão">
        {operations.map(o=><button type="button" key={o.id} disabled={busy} aria-current={o.id===operation.id?'step':undefined} onClick={()=>changeOperation(o.id)}>
          <strong>Operação {operationNumber(o.position)}</strong>
          <span className="order-operations-review-description">{o.document.description || 'Sem descrição'}</span>
          <span className={`operation-status ${o.status}`}>{statusNames[o.status]}</span>
        </button>)}
      </nav>
      {operation.status!=='awaiting_review'&&!['reviewed','completed'].includes(operation.status)&&<p>Esta operação ainda não está disponível para conclusão da revisão.</p>}
    </section>}
  />;
}
