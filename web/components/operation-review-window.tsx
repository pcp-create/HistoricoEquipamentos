"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileDown } from "lucide-react";
import ChecklistReviewReport from "./checklist-review-report";
import ScheduleTimeLogs from "./schedule-time-logs";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { materialWithdrawals } from "@/lib/service-scheduling/material-balance";
import { reportSubmission } from "@/lib/service-scheduling/checklists";
import { statusNames } from "@/lib/service-scheduling/model";
export default function OperationReviewWindow({ operation: o, data, busy, dirty, error, mutate, onClose, onReportDirty }: any) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reportMode,setReportMode]=useState("complete");
  const [tab, setTab] = useState("report");
  const [reportDirty,setReportDirty]=useState(false);
  const updateReportDirty=(value:boolean)=>{setReportDirty(value);onReportDirty?.(value);if(value)setConfirmed(false);};
  const close=()=>{if(!reportDirty||window.confirm("Descartar as correções não salvas e fechar a revisão?")){onReportDirty?.(false);onClose();}};
  const [confirmed, setConfirmed] = useState(false);
  const reviewed = ["reviewed", "completed"].includes(o.status);
  useEffect(() => {
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => setConfirmed(false), [o.version]);
  const scoped = { ...data, operations: [o],
    events: (data.events || []).filter((v: any) => v.operation_id === o.id),
    fieldSessions: (data.fieldSessions || []).filter((v: any) => v.operation_id === o.id),
    fieldEvents: (data.fieldEvents || []).filter((v: any) => v.operation_id === o.id),
    requests: (data.requests || []).filter((v: any) => v.operation_id === o.id) };
  const act = (action: string) => mutate({ action, operationId: o.id, version: o.version });
  return createPortal(<dialog ref={dialog} className="scheduling-page operation-review-window" aria-label={`Revisão da operação ${operationNumber(o.position)}`} onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <header className="operation-review-header">
      <div><h2>OS {data.detail?.order?.numero_sequencia || data.schedule.order_id}/{operationNumber(o.position)} · Revisão da operação</h2><p>{o.document.description || "Sem descrição"} · {statusNames[o.status]}</p></div>
      <button type="button" aria-label="Fechar revisão" disabled={busy} onClick={close}><X size={20}/></button>
    </header>
    <nav className="operation-review-tabs" aria-label="Seções da revisão">
      {[["report", "Relatório"], ["parts", "Peças"], ["logs", "Apontamentos"], ["history", "Histórico"]].map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
    </nav>
    <div className="operation-review-content">
      {dirty && <p role="alert">Há alterações não salvas na programação. Feche esta janela e salve a operação antes de revisar.</p>}
      {error && <p className="operation-review-error" role="alert">{error}</p>}
      <div hidden={tab!=="report"}>{o.document.checklistId || o.document.checklistRun ? <ChecklistReviewReport operation={o} data={data} busy={busy} disabled={dirty} mutate={mutate} onDirtyChange={updateReportDirty}/> : <p>Esta operação não possui checklist.</p>}</div>
      {tab === "logs" && <ScheduleTimeLogs data={scoped} onChanged={() => window.dispatchEvent(new Event("service-schedule-updated"))}/>}
      {tab === "parts" && <>
        <p>Retiradas desta operação e utilização registrada na OS.</p>
        <div className="scheduling-table"><table><thead><tr><th>Peça</th><th>Unidade</th><th>Reservado na OS</th><th>Retirado nesta operação</th><th>Utilizado na OS</th></tr></thead><tbody>
          {(data.detail?.materials || []).map((item: any) => {
            const usage = (data.usage || []).find((v: any) => String(v.item_id) === String(item.id_m8) && String(v.item_company) === String(item.item_company) && String(v.item_order) === String(item.item_order));
            const own = materialWithdrawals(usage).find(v => v.operationId === o.id)?.quantity || 0;
            return <tr key={`${item.item_company}:${item.item_order}:${item.id_m8}`}><td>{item.produto_id} · {item.produto_nome}</td><td>{item.unidade_nome}</td><td>{Number(item.quantidade || 0).toLocaleString("pt-BR")}</td><td>{own.toLocaleString("pt-BR")}</td><td>{usage?.used == null ? "Não informado" : Number(usage.used).toLocaleString("pt-BR")}</td></tr>;
          })}
        </tbody></table></div>
        {!data.detail?.materials?.length && <p>Nenhuma peça cadastrada nesta OS.</p>}
      </>}
      {tab === "history" && <ul className="operation-review-history">{scoped.events.map((event: any) => <li key={event.id}><strong>{event.display_name || event.actor}</strong> · {new Date(event.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<p>{event.description || event.action}</p></li>)}</ul>}
    </div>
    <footer className="operation-review-footer">
      {data.canEditSettings && !reviewed && reportSubmission(o.document.checklistRun) && <button type="button" disabled={busy || dirty || reportDirty} onClick={() => void act("report_reopen")}>Devolver relatório ao técnico</button>}
      {data.canEditSettings && o.status === "awaiting_review" && <>
        <label><input type="checkbox" checked={confirmed} disabled={busy || dirty || reportDirty} onChange={e => setConfirmed(e.target.checked)}/> Conferi o relatório, as peças e os apontamentos desta operação.</label>
        <button type="button" disabled={busy || dirty || reportDirty || !confirmed || scoped.requests.some((r: any) => r.status === "pending")} onClick={() => void act("review")}>Concluir revisão</button>
        {scoped.requests.some((r: any) => r.status === "pending") && <small>Há solicitações de apontamento aguardando aprovação.</small>}
      </>}
      {reviewed && o.document.checklistRun && !busy ? <><select aria-label="Tipo de relatório" value={reportMode} onChange={e=>setReportMode(e.target.value)}><option value="complete">Relatório Completo</option><option value="summary">Relatório Resumido</option><option value="budget">Relatório de Orçamento</option></select><a href={`/api/service-scheduling/checklist-pdf?operationId=${o.id}&mode=${reportMode}`} target="_blank" rel="noreferrer"><FileDown size={16}/> Gerar PDF</a></> : o.document.checklistId && <small>O PDF será liberado após a conclusão da revisão.</small>}
      {data.canEditSettings && o.status === "reviewed" && <button type="button" disabled={busy || dirty || reportDirty} onClick={() => void act("complete")}>Concluir operação</button>}
    </footer>
  </dialog>, document.body);
}
