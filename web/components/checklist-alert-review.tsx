"use client";
import { AlertTriangle } from 'lucide-react';
import type {ChecklistAlert} from '@/lib/service-scheduling/checklist-alerts';
export default function ChecklistAlertReview({alerts,existing,editable,busy,users,value,onChange}: {alerts:ChecklistAlert[];existing:any;editable:boolean;busy:boolean;users:any[];value:{assignedTo:string;description:string;reportMode:string};onChange:(v:any)=>void}) {
 if(!alerts.length)return null;
 return <section className="checklist-review-alerts" aria-label="Alertas do checklist">
  <h3><AlertTriangle size={20}/> {alerts.length} alerta(s) identificado(s)</h3>
  <ul>{alerts.map(a=><li key={`${a.stageId}:${a.fieldId}`}><strong>{a.label}: {a.value}</strong><small>{a.stage}</small></li>)}</ul>
  {existing?<p>Tarefa <a href={`/tarefas?task=${encodeURIComponent(existing.taskId)}`} target="_blank" rel="noreferrer">#{existing.taskId}</a> já criada para estes alertas, com relatório anexo.</p>:editable?<>
   <p>Para concluir a revisão, defina a tarefa que reunirá estes alertas. O relatório desta operação será anexado automaticamente.</p>
   <div className="checklist-review-alert-form">
    <label>Responsável pela tarefa<select aria-label="Responsável pela tarefa dos alertas" disabled={busy} value={value.assignedTo} onChange={e=>onChange({...value,assignedTo:e.target.value})}><option value="">Selecione o responsável</option>{users.filter(u=>u.enabled).map(u=><option key={u.email} value={u.email}>{u.display_name||u.email}</option>)}</select></label>
    <label>Relatório anexo<select aria-label="Relatório anexo à tarefa dos alertas" disabled={busy} value={value.reportMode} onChange={e=>onChange({...value,reportMode:e.target.value})}><option value="complete">Completo</option><option value="summary">Resumido</option><option value="budget">Orçamento</option></select></label>
    <label className="checklist-review-alert-description">Descrição da tarefa<textarea aria-label="Descrição da tarefa dos alertas" disabled={busy} maxLength={8000} rows={3} value={value.description} onChange={e=>onChange({...value,description:e.target.value})} placeholder="Descreva a ação necessária para tratar os alertas."/></label>
   </div>
  </>:<p>Os alertas serão encaminhados para uma tarefa na conclusão da revisão.</p>}
 </section>;
}
