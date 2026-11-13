"use client";
import {useEquipmentMeterReading} from './use-equipment-meter-reading';
import {meterReviewAlerts} from '@/lib/service-scheduling/meter-review-alerts';
import {operationMeterEquipment} from '@/lib/service-scheduling/meter-equipment';
import {stagesOf} from '@/lib/service-scheduling/checklists';
import OperationEquipmentSelect from "./operation-equipment-select";
import {reportEquipment} from "@/lib/service-scheduling/technical-report";
import {unlinkedMeterWarning} from "@/lib/service-scheduling/meter-equipment";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileDown, CheckCheck, FileOutput } from "lucide-react";
import OrderTaskWindow from "./order-task-window";
import ChecklistAlertReview, {type AlertTaskDraft} from "./checklist-alert-review";
import {checklistAlerts,pendingChecklistAlerts,validateAlertTaskGroups} from "@/lib/service-scheduling/checklist-alerts";
import ChecklistReviewReport from "./checklist-review-report";
import ScheduleTimeLogs from "./schedule-time-logs";
import { operationNumber } from "@/lib/service-scheduling/operation-number";
import { materialWithdrawals } from "@/lib/service-scheduling/material-balance";
import { reportSubmission } from "@/lib/service-scheduling/checklists";
import { statusNames } from "@/lib/service-scheduling/model";
export default function OperationReviewWindow({ operation: o, data, busy, dirty, error, mutate, onClose, onReportDirty, navigation, embedded=false }: any) {
  const tabsId = useId();
  const [saveTarget,setSaveTarget]=useState<HTMLDivElement|null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [taskOpen,setTaskOpen]=useState(false);
  const [reportMode,setReportMode]=useState("complete");
  const [tab, setTab] = useState("report");
  const [reportDirty,setReportDirty]=useState(false);
  const updateReportDirty=(value:boolean)=>setReportDirty(value);
  const close=()=>{if(!(reportDirty||alertTaskDirty)||window.confirm("Descartar as correções não salvas e fechar a revisão?")){onReportDirty?.(false);onClose();}};
  const [alertTasks,setAlertTasks]=useState<AlertTaskDraft[]>([]);
  useEffect(()=>{if(o.status!=='awaiting_review')setAlertTasks([]);},[o.status]);
  const [reviewRun,setReviewRun]=useState<any>(null);
  useEffect(()=>setReviewRun(null),[o.id,o.version]);
  const meterReference=useEquipmentMeterReading(stagesOf(o.document.checklistRun?.template||{items:[],stages:[]}).some(stage=>stage.fields.some(field=>field.type==='meter'))?operationMeterEquipment(o.document):undefined);
  const meterAlerts=meterReviewAlerts(reviewRun||o.document.checklistRun,meterReference.reading?.meter);
  const meterWarning=unlinkedMeterWarning(o.document);
  const alerts=checklistAlerts(o.document.checklistRun);
  const pendingAlerts=pendingChecklistAlerts(o.document,alerts);
  const alertTaskDirty=o.status==='awaiting_review'&&alertTasks.length>0;
  useEffect(()=>{onReportDirty?.(reportDirty||alertTaskDirty);},[reportDirty,alertTaskDirty]);
  let missingAlertTask=false;
  try{validateAlertTaskGroups(pendingAlerts,alertTasks);}catch{missingAlertTask=true;}
  const reviewed = ["reviewed", "completed"].includes(o.status);
  useEffect(() => {
    if(embedded)return;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [embedded]);
  const scoped = { ...data, operations: [o],
    events: (data.events || []).filter((v: any) => v.operation_id === o.id),
    fieldSessions: (data.fieldSessions || []).filter((v: any) => v.operation_id === o.id),
    fieldEvents: (data.fieldEvents || []).filter((v: any) => v.operation_id === o.id),
    requests: (data.requests || []).filter((v: any) => v.operation_id === o.id) };
  const act = (action: string) => {
    if(action==='report_reopen'&&o.status==='reviewed'&&!window.confirm('Devolver o relatório revisado ao técnico para ajuste? A operação voltará para execução e precisará de uma nova revisão.'))return;
    return mutate({ action, operationId: o.id, version: o.version, ...(action==="review"?{alertTasks}:{}) });
  };
  const canChooseEquipment=data.canEditSettings&&o.status==='awaiting_review';
  const equipmentPicker=(inReport=false)=><OperationEquipmentSelect scheduleId={String(data.schedule.id)} value={o.document.equipmentId||''} label={o.document.equipment?.name||''} displayLabel={inReport?reportEquipment(o,data.detail?.order||{}):undefined} unassigned={o.document.equipmentUnassigned===true} orderLabel="Selecionar equipamento" allowOrderFallback={false} unassignedLabel="Sem equipamento informado" disabled={busy||dirty||reportDirty} onChange={(equipmentId)=>void mutate({action:'review_equipment',operationId:o.id,version:o.version,equipmentId})}/>;
  const content=<>
    <header className="operation-review-header">
      <div><h2>OS {data.detail?.order?.numero_sequencia || data.schedule.order_id}/{operationNumber(o.position)} · Revisão da operação</h2><p>{o.document.description || "Sem descrição"} · {statusNames[o.status]}</p></div>
      {!embedded&&<button type="button" aria-label="Fechar revisão" disabled={busy} onClick={close}><X size={20}/></button>}
    </header>
    {navigation}
    <nav className="operation-review-tabs" role="tablist" aria-label="Seções da revisão" onKeyDown={e => {
      const keys = ["report", "alerts", "parts", "logs", "history"];
      const index = keys.indexOf(tab);
      const next = e.key === "ArrowRight" ? (index + 1) % keys.length : e.key === "ArrowLeft" ? (index + keys.length - 1) % keys.length : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault(); setTab(keys[next]);
      document.getElementById(`${tabsId}-${keys[next]}`)?.focus();
    }}>
      {[["report", "Relatório"], ["alerts", `Alertas (${alerts.length+(meterWarning?1:0)+meterAlerts.length})`], ["parts", "Peças"], ["logs", "Apontamentos"], ["history", "Histórico"]].map(([key, label]) => <button key={key} type="button" className={key==="alerts"&&(alerts.length>0||!!meterWarning||meterAlerts.length>0)?"review-tab-alerts":undefined} role="tab" id={`${tabsId}-${key}`} aria-selected={tab === key} aria-controls={`${tabsId}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}>{label}</button>)}
    </nav>
    <div className="operation-review-content" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} tabIndex={0}>
      {tab==='alerts'&&meterWarning&&<div className="operation-review-meter-warning" role="alert">
        <p>{meterWarning}</p>
        {canChooseEquipment&&<div className="review-alert-equipment">
          {equipmentPicker()}
          <small>Defina o equipamento para atribuir a coleta ou escolha “Sem equipamento informado” para seguir com a leitura somente no relatório.</small>
          {reportDirty&&<small>Salve os ajustes do relatório antes de definir o equipamento.</small>}
        </div>}
      </div>}
      {tab==='alerts'&&meterAlerts.map(alert=><div key={alert.stageId+':'+alert.fieldId} className="review-meter-regression-alert" role="alert"><strong>Horímetro abaixo da última coleta</strong><p>{alert.message}</p><button type="button" onClick={()=>{setTab('report');requestAnimationFrame(()=>document.getElementById(`review-meter-${o.id}-${alert.stageId}-${alert.fieldId}`)?.scrollIntoView({block:'center',behavior:'smooth'}));}}>Verificar campo no relatório</button></div>)}
      {dirty && <p role="alert">Há alterações não salvas na programação. Feche esta janela e salve a operação antes de revisar.</p>}
      {error && <p className="operation-review-error" role="alert">{error}</p>}
      {tab==='alerts'&&<ChecklistAlertReview alerts={alerts} document={o.document} editable={data.canEditSettings&&o.status==='awaiting_review'} busy={busy||reportDirty||dirty} users={data.users||[]} value={o.status==='awaiting_review'?alertTasks:[]} onChange={setAlertTasks}/>}
      {tab==='alerts'&&reviewed&&data.canEditSettings&&<div className="alert-group-actions"><button type="button" disabled={busy||dirty||reportDirty||!o.document.checklistRun} onClick={()=>setTaskOpen(true)}>Criar tarefa da operação</button><small>O relatório anexo será somente desta operação.</small></div>}
      {taskOpen&&<OrderTaskWindow data={data} operation={o} onClose={()=>setTaskOpen(false)}/>}
      {tab==='alerts'&&reportDirty&&<p role="status">Salve os ajustes do relatório para atualizar os alertas e seus comentários.</p>}
      <div hidden={tab!=="report"}>{o.document.checklistId || o.document.checklistRun ? <ChecklistReviewReport operation={o} data={data} busy={busy} disabled={dirty} mutate={mutate} onDirtyChange={updateReportDirty} saveTarget={saveTarget} equipmentControl={canChooseEquipment?equipmentPicker(true):null} meterReference={meterReference} onRunChange={setReviewRun}/> : <p>Esta operação não possui checklist.</p>}</div>
      {tab === "logs" && <ScheduleTimeLogs data={scoped} onChanged={() => window.dispatchEvent(new Event("service-schedule-updated"))}/>}
      {tab === "parts" && <>
        <p>Retiradas desta operação e movimentações da OS. Entregue e Recebido: almoxarifado. Devolvido: informado pelo técnico no app.</p>
        <div className="scheduling-table"><table><thead><tr><th>Peça</th><th>Unidade</th><th>Reservado na OS</th><th>Retirado nesta operação</th><th>Entregue</th><th>Devolvido</th><th>Recebido</th><th>Utilizado na OS</th></tr></thead><tbody>
          {(data.detail?.materials || []).map((item: any) => {
            const usage = (data.usage || []).find((v: any) => String(v.item_id) === String(item.id_m8) && String(v.item_company) === String(item.item_company) && String(v.item_order) === String(item.item_order));
            const own = materialWithdrawals(usage).find(v => v.operationId === o.id)?.quantity || 0;
            return <tr key={`${item.item_company}:${item.item_order}:${item.id_m8}`}><td>{item.produto_id} · {item.produto_nome}</td><td>{item.unidade_nome}</td><td>{Number(item.quantidade || 0).toLocaleString("pt-BR")}</td><td>{own.toLocaleString("pt-BR")}</td><td>{Number(item.movement?.delivered||0).toLocaleString("pt-BR")}</td><td>{Number(item.movement?.returnedInApp||0).toLocaleString("pt-BR")}</td><td>{Number(item.movement?.received||0).toLocaleString("pt-BR")}</td><td>{usage?.used == null ? "Não informado" : Number(usage.used).toLocaleString("pt-BR")}</td></tr>;
          })}
        </tbody></table></div>
        {!data.detail?.materials?.length && <p>Nenhuma peça cadastrada nesta OS.</p>}
      </>}
      {tab === "history" && <ul className="operation-review-history">{scoped.events.map((event: any) => <li key={event.id}><strong>{event.display_name || event.actor}</strong> · {new Date(event.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}<p>{event.description || event.action}</p></li>)}</ul>}
    </div>
    <footer className="operation-review-footer">
      {data.canEditSettings && o.status === "awaiting_review" && <>
        <div className="review-completion-steps">
          <section className="review-completion-step" aria-label="Etapa 1: salvar ajustes">
            <div ref={setSaveTarget} className="review-save-actions"/>
            {!reportDirty&&<span className="review-saved">Ajustes salvos</span>}
          </section>
          {missingAlertTask&&<button type="button" disabled={busy||dirty||reportDirty} onClick={()=>setTab('alerts')}>Organizar tarefas dos alertas</button>}
          <section className="review-completion-step" aria-label="Etapa 2: concluir revisão">
            <button type="button" className="review-complete-button" aria-describedby={`${tabsId}-agreement`} disabled={busy || dirty || reportDirty || missingAlertTask || scoped.requests.some((r: any) => r.status === "pending")} onClick={() => void act("review")}><CheckCheck size={16} aria-hidden="true"/>Concluir revisão</button>
          </section>
          {reportSubmission(o.document.checklistRun)&&<button type="button" className="review-return-button" disabled={busy || dirty || reportDirty} onClick={() => void act("report_reopen")}><FileOutput size={15} aria-hidden="true"/>Devolver relatório ao técnico</button>}
        </div>
        <div className="review-completion-notes">
          {reportDirty&&<span className="review-pending-note" role="status">Há ajustes pendentes. Salve antes de concluir a revisão.</span>}
          {missingAlertTask&&<span>Defina responsável e descrição para todos os alertas.</span>}
          {scoped.requests.some((r:any)=>r.status==='pending')&&<span>Há solicitações de apontamento aguardando aprovação.</span>}
          <span id={`${tabsId}-agreement`}>Ao concluir, declaro: li, revisei e estou de acordo com as informações do relatório, das peças e dos apontamentos.</span>
        </div>
      </>}
      {data.canEditSettings && o.status!=="completed" && o.status!=="awaiting_review" && reportSubmission(o.document.checklistRun) && <button type="button" className="review-return-button" disabled={busy || dirty || reportDirty} onClick={() => void act("report_reopen")}><FileOutput size={15} aria-hidden="true"/>Devolver relatório ao técnico</button>}
      {reviewed && o.document.checklistRun && !busy ? <><select aria-label="Tipo de relatório" value={reportMode} onChange={e=>setReportMode(e.target.value)}><option value="complete">Relatório Completo</option><option value="summary">Relatório Resumido</option><option value="budget">Relatório de Orçamento</option></select><a href={`/api/service-scheduling/checklist-pdf?operationId=${o.id}&mode=${reportMode}`} target="_blank" rel="noreferrer"><FileDown size={16}/> Gerar PDF</a></> : o.status!=="awaiting_review" && o.document.checklistId && <small>O PDF será liberado após a conclusão da revisão.</small>}

    </footer>
  </>;
  if(embedded)return <section className="operation-review-section" aria-label={`Revisão da operação ${operationNumber(o.position)}`}>{content}</section>;
  return createPortal(<dialog ref={dialog} className="scheduling-page operation-review-window" aria-label={`Revisão da operação ${operationNumber(o.position)}`} onCancel={e=>{e.preventDefault();if(!busy)close();}}>{content}</dialog>,document.body);
}
