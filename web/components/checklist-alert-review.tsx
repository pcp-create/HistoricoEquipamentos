"use client";
import AutoResizeTextarea from "./auto-resize-textarea";
import {useState} from 'react';
import {AlertTriangle,Plus,Trash2,Layers} from 'lucide-react';
import {alertKey,pendingChecklistAlerts,type ChecklistAlert} from '@/lib/service-scheduling/checklist-alerts';
export type AlertTaskDraft={alertKeys:string[];assignedTo:string;description:string;reportMode:string};
export default function ChecklistAlertReview({alerts,document,editable,busy,users,value,onChange}:{alerts:ChecklistAlert[];document:any;editable:boolean;busy:boolean;users:any[];value:AlertTaskDraft[];onChange:(v:AlertTaskDraft[])=>void}){
 const [selected,setSelected]=useState<string[]>([]);
 const pending=pendingChecklistAlerts(document,alerts);
 const allocated=new Set(value.flatMap(t=>t.alertKeys));
 const available=pending.filter(a=>!allocated.has(alertKey(a)));
 const picked=available.filter(a=>selected.includes(alertKey(a)));
 function create(separate:boolean){
  if(busy||!picked.length||(!separate&&picked.length<2))return;
  const groups=separate?picked.map(a=>[a]):[picked];
  onChange([...value,...groups.map(group=>({alertKeys:group.map(alertKey),assignedTo:'',description:'',reportMode:'complete'}))]);setSelected([]);
 }
 function edit(index:number,patch:Partial<AlertTaskDraft>){onChange(value.map((v,i)=>i===index?{...v,...patch}:v));}
 const summary=(a:ChecklistAlert)=><div><strong>{a.label}: {a.value}</strong><small>{a.stage}</small><p className="alert-comment"><b>Comentário:</b> {a.comment||'Não informado'}</p></div>;
 if(!alerts.length)return <p>Nenhum alerta identificado nesta operação.</p>;
 return <section className="checklist-review-alerts" aria-label="Alertas do checklist">
  <h3><AlertTriangle size={20}/>{alerts.length} alerta(s) identificado(s)</h3>
  {editable&&<p>Selecione os alertas para agrupar em uma tarefa ou separar em tarefas individuais. Cada tarefa terá seu responsável, descrição e relatório anexo. As tarefas serão criadas e encaminhadas somente ao concluir a revisão desta operação, com o relatório final anexado.</p>}
  {available.length>0&&<div className="alert-selection-list">
   {editable&&<label className="alert-selection"><input type="checkbox" disabled={busy} checked={available.every(a=>selected.includes(alertKey(a)))} onChange={e=>setSelected(e.target.checked?available.map(alertKey):[])}/>Selecionar todos os alertas disponíveis</label>}
   {available.map(a=><label key={alertKey(a)} className="alert-selection">{editable&&<input type="checkbox" aria-label={`Selecionar alerta: ${a.stage} · ${a.label}`} disabled={busy} checked={selected.includes(alertKey(a))} onChange={e=>setSelected(v=>e.target.checked?[...v,alertKey(a)]:v.filter(k=>k!==alertKey(a)))}/>} {summary(a)}</label>)}
  </div>}
  {editable&&available.length>0&&<div className="alert-group-actions"><button className="alert-group-primary" type="button" disabled={busy||picked.length<2} onClick={()=>create(false)}><Layers size={18}/>Agrupar selecionados em uma tarefa</button><button type="button" disabled={busy||!picked.length} onClick={()=>create(true)}><Plus size={18}/>Criar uma tarefa por alerta</button></div>}
  {editable&&pending.length>0&&<p className="alert-task-summary" role="status">{available.length} alerta(s) sem tarefa · {value.length} tarefa(s) preparada(s)</p>}
  {value.map((task,index)=><section className="alert-task-card" key={index} aria-label={`Tarefa dos alertas ${index+1}`}>
   <header><h4>Tarefa {index+1}</h4><button type="button" aria-label={`Remover tarefa ${index+1}`} disabled={busy||!editable} onClick={()=>onChange(value.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></header>
   {task.alertKeys.map(key=>{const a=pending.find(a=>alertKey(a)===key);return a?<div className="alert-task-item" key={key}>{summary(a)}</div>:<p key={key} role="alert">Este alerta foi alterado no relatório. Remova esta tarefa e reorganize os alertas.</p>;})}
   <div className="checklist-review-alert-form">
    <label>Responsável pela tarefa<select disabled={busy||!editable} value={task.assignedTo} onChange={e=>edit(index,{assignedTo:e.target.value})}><option value="">Selecione o responsável</option>{users.filter(u=>u.enabled).map(u=><option key={u.email} value={u.email}>{u.display_name||u.email}</option>)}</select></label>
    <label>Relatório anexo<select disabled={busy||!editable} value={task.reportMode} onChange={e=>edit(index,{reportMode:e.target.value})}><option value="complete">Completo</option><option value="summary">Resumido</option><option value="budget">Orçamento</option></select></label>
    <label className="checklist-review-alert-description">Descrição da tarefa<AutoResizeTextarea disabled={busy||!editable} maxLength={8000} rows={4} value={task.description} onChange={e=>edit(index,{description:e.target.value})} placeholder="Descreva o que deve ser feito para tratar os alertas desta tarefa. Inclua as orientações necessárias para o responsável."/></label>
   </div>
   {editable&&<p className="alert-task-summary">{task.assignedTo&&task.description.trim()?'Atribuição preparada. A tarefa será criada com o relatório final ao concluir a revisão.':'Preencha o responsável e a descrição para liberar a conclusão da revisão.'}</p>}
  </section>)}
  {(document.checklistAlertTasks||[]).map((task:any)=><section className="alert-task-card" key={task.taskId}><h4>Tarefa <a href={`/tarefas?task=${encodeURIComponent(task.taskId)}`} target="_blank" rel="noreferrer">#{task.taskId}</a> · Criada</h4><p>Responsável: {users.find(u=>u.email===task.assignedTo)?.display_name||task.assignedTo||'Consulte a tarefa'}</p>{(task.alerts||[]).map((a:ChecklistAlert)=><div className="alert-task-item" key={alertKey(a)}>{summary(a)}</div>)}<p>Relatório anexado à tarefa.</p></section>)}
 </section>;
}
