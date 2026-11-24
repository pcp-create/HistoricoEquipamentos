"use client";
import "./checklist-alert-review.css";
import ActionNotice from './action-notice';
import AutoResizeTextarea from "./auto-resize-textarea";
import {useState} from 'react';
import {AlertTriangle,Plus,Trash2,Layers} from 'lucide-react';
import {alertKey,pendingChecklistAlerts,type ChecklistAlert} from '@/lib/service-scheduling/checklist-alerts';
export type AlertTaskDraft={alertKeys:string[];assignedTo:string;description:string;reportMode:string;taskType?:'standard'|'approval';existingTaskId?:string;existingTaskTitle?:string};
export default function ChecklistAlertReview({alerts,document,editable,busy,users,value,onChange,scope="operation"}:{alerts:ChecklistAlert[];document:any;editable:boolean;busy:boolean;users:any[];value:AlertTaskDraft[];onChange:(v:AlertTaskDraft[])=>void;scope?:"operation"|"order"}){
 const [selected,setSelected]=useState<string[]>([]);
 const [linkOpen,setLinkOpen]=useState(false),[taskNumber,setTaskNumber]=useState(''),[lookupBusy,setLookupBusy]=useState(false),[lookupError,setLookupError]=useState('');
 const pending=pendingChecklistAlerts(document,alerts);
 const allocated=new Set(value.flatMap(t=>t.alertKeys));
 const available=pending.filter(a=>!allocated.has(alertKey(a)));
 const picked=available.filter(a=>selected.includes(alertKey(a)));
 function create(separate:boolean){
  if(busy||!picked.length||(!separate&&picked.length<2))return;
  const groups=separate?picked.map(a=>[a]):[picked];
  onChange([...value,...groups.map(group=>({alertKeys:group.map(alertKey),assignedTo:'',description:'',reportMode:'complete',taskType:'standard' as const}))]);setSelected([]);
 }
 async function linkExisting(){
  const id=taskNumber.trim().replace(/^TAR[-\s]*/i,'');
  if(!/^[1-9]\d{0,14}$/.test(id)){setLookupError('Informe um número de tarefa válido.');return;}
  if(!picked.length)return;setLookupBusy(true);setLookupError('');
  try{const response=await fetch('/api/service-scheduling/alert-task?id='+encodeURIComponent(id),{cache:'no-store'});const task=await response.json();if(!response.ok)throw Error(task.error||'Não foi possível consultar a tarefa.');
   onChange([...value,{alertKeys:picked.map(alertKey),existingTaskId:task.id,existingTaskTitle:task.title,assignedTo:'',description:'',reportMode:'complete'}]);setSelected([]);setLinkOpen(false);setTaskNumber('');
  }catch(error){setLookupError(error instanceof Error?error.message:'Não foi possível consultar a tarefa.');}finally{setLookupBusy(false);}
 }
 function edit(index:number,patch:Partial<AlertTaskDraft>){onChange(value.map((v,i)=>i===index?{...v,...patch}:v));}
 const summary=(a:ChecklistAlert)=><div><strong>{a.label}: {a.value}</strong><small>{a.operationPosition?`Operação ${String(a.operationPosition).padStart(2,"0")} · `:""}{a.stage}</small><p className="alert-comment"><b>Comentário:</b> {a.comment||'Não informado'}</p></div>;
 return <section className="checklist-review-alerts" aria-label="Alertas do checklist">
  {alerts.length>0?<h3><AlertTriangle size={20}/>{alerts.length} alerta(s) identificado(s)</h3>:<p>Nenhum alerta identificado.</p>}
  {editable&&alerts.length>0&&<p>Selecione os alertas para agrupar em uma tarefa ou separar em tarefas individuais. Cada tarefa terá seu responsável, descrição e relatório anexo. As tarefas serão criadas e encaminhadas somente ao concluir a revisão {scope==="order"?"da OS":"desta operação"}, com o relatório final anexado.</p>}
  {available.length>0&&<div className="alert-selection-list">
   {editable&&<label className="alert-selection"><input type="checkbox" disabled={busy} checked={available.every(a=>selected.includes(alertKey(a)))} onChange={e=>setSelected(e.target.checked?available.map(alertKey):[])}/>Selecionar todos os alertas disponíveis</label>}
   {available.map(a=><label key={alertKey(a)} className="alert-selection">{editable&&<input type="checkbox" aria-label={`Selecionar alerta: ${a.operationPosition?`Operação ${String(a.operationPosition).padStart(2,"0")} · `:""}${a.stage} · ${a.label}`} disabled={busy} checked={selected.includes(alertKey(a))} onChange={e=>setSelected(v=>e.target.checked?[...v,alertKey(a)]:v.filter(k=>k!==alertKey(a)))}/>} {summary(a)}</label>)}
  </div>}
  {editable&&available.length>0&&<div className="alert-group-actions"><button className="alert-group-primary" type="button" disabled={busy||picked.length<2} onClick={()=>create(false)}><Layers size={18}/>Agrupar selecionados em uma tarefa</button><button type="button" disabled={busy||!picked.length} onClick={()=>create(true)}><Plus size={18}/>Criar uma tarefa por alerta</button>{scope==='order'&&<button type="button" disabled={busy||!picked.length||lookupBusy} onClick={()=>{setLinkOpen(true);setLookupError('');}}>Vincular tarefa existente</button>}</div>}
  {linkOpen&&scope==='order'&&<div className="alert-existing-task"><label>Número da tarefa<input type="text" inputMode="numeric" value={taskNumber} maxLength={20} placeholder="Ex.: 2232" disabled={busy||lookupBusy} onChange={e=>setTaskNumber(e.target.value)}/></label><button type="button" disabled={busy||lookupBusy||!picked.length} onClick={()=>void linkExisting()}>{lookupBusy?'Consultando…':'Confirmar vínculo'}</button><button type="button" disabled={lookupBusy} onClick={()=>{setLinkOpen(false);setLookupError('');}}>Cancelar</button>{lookupError&&<ActionNotice type="error" onClose={()=>setLookupError('')}>{lookupError}</ActionNotice>}</div>}
  {editable&&pending.length>0&&<p className="alert-task-summary" role="status">{available.length} alerta(s) sem tarefa · {value.length} tarefa(s) preparada(s)</p>}
  {editable&&scope!=="order"&&<div className="alert-group-actions"><button type="button" disabled={busy} onClick={()=>onChange([...value,{alertKeys:[],assignedTo:'',description:'',reportMode:'complete',taskType:'standard'}])}><Plus size={18}/>Criar tarefa da operação</button><small>O anexo incluirá somente o relatório desta operação. A tarefa será enviada ao concluir a revisão.</small></div>}
  {value.map((task,index)=><section className="alert-task-card" key={index} aria-label={`Tarefa dos alertas ${index+1}`}>
   <header><h4>{task.existingTaskId?`Vincular à tarefa TAR-${task.existingTaskId}`:`Tarefa ${index+1}`}</h4><button type="button" aria-label={`Remover tarefa ${index+1}`} disabled={busy||!editable} onClick={()=>onChange(value.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></header>
   {task.alertKeys.map(key=>{const a=pending.find(a=>alertKey(a)===key);return a?<div className="alert-task-item" key={key}>{summary(a)}</div>:<p key={key} role="alert">Este alerta foi alterado no relatório. Remova esta tarefa e reorganize os alertas.</p>;})}
   {task.existingTaskId&&<p>{task.existingTaskTitle} · O vínculo e o relatório serão registrados ao concluir a revisão.</p>}
   {!task.existingTaskId&&scope==="order"&&<p>Será anexado um único PDF agrupado com os relatórios de todas as operações da OS, no formato selecionado.</p>}
   {!task.existingTaskId&&<div className="checklist-review-alert-form">
    <label>Tipo de tarefa<select disabled={busy||!editable} value={task.taskType||'standard'} onChange={e=>edit(index,{taskType:e.target.value as 'standard'|'approval'})}><option value="standard">Tarefa de ação</option><option value="approval">Tarefa de aprovação</option></select></label>
    {task.taskType==='approval'&&<p>Para ciência e aprovação da condição, sem ação imediata. O destinatário receberá as opções Aprovar ou Reprovar, com justificativa e relatório anexo.</p>}
    <label>{task.taskType==='approval'?'Responsável pela aprovação':'Responsável pela tarefa'}<select disabled={busy||!editable} value={task.assignedTo} onChange={e=>edit(index,{assignedTo:e.target.value})}><option value="">Selecione o responsável</option>{users.filter(u=>u.enabled).map(u=><option key={u.email} value={u.email}>{u.display_name||u.email}</option>)}</select></label>
    <label>Relatório anexo<select disabled={busy||!editable} value={task.reportMode} onChange={e=>edit(index,{reportMode:e.target.value})}><option value="complete">Completo</option><option value="summary">Resumido</option><option value="budget">Orçamento</option></select></label>
    <label className="checklist-review-alert-description">Descrição da tarefa<AutoResizeTextarea disabled={busy||!editable} maxLength={8000} rows={4} value={task.description} onChange={e=>edit(index,{description:e.target.value})} placeholder={task.taskType==='approval'?"Descreva a condição que deve ser analisada e aprovada, incluindo as informações para ciência do responsável.":"Descreva o que deve ser feito para tratar os alertas desta tarefa. Inclua as orientações necessárias para o responsável."}/></label>
   </div>}
   {!task.existingTaskId&&editable&&<p className="alert-task-summary">{task.assignedTo&&task.description.trim()?'Atribuição preparada. A tarefa será criada com o relatório final ao concluir a revisão.':'Preencha o responsável e a descrição para liberar a conclusão da revisão.'}</p>}
  </section>)}
  {(document.checklistAlertTasks||[]).map((task:any)=><section className="alert-task-card" key={task.taskId}><h4>Tarefa <a href={`/tarefas?task=${encodeURIComponent(task.taskId)}`} target="_blank" rel="noreferrer">#{task.taskId}</a> · {task.existingTask?'Vinculada':'Criada'}{task.taskType==='approval'?' · Aprovação':''}</h4><p>Responsável: {users.find(u=>u.email===task.assignedTo)?.display_name||task.assignedTo||'Consulte a tarefa'}</p>{(task.alerts||[]).map((a:ChecklistAlert)=><div className="alert-task-item" key={alertKey(a)}>{summary(a)}</div>)}<p>Relatório anexado à tarefa.</p></section>)}
 </section>;
}
