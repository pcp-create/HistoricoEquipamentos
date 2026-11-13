"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Plus} from 'lucide-react';
import {apiFetch} from '@/lib/client-api-cache';
import AutoResizeTextarea from './auto-resize-textarea';
export default function OrderTaskWindow({data,onClose,operation}:any){
 const dialog=useRef<HTMLDialogElement>(null),requestId=useRef(''),submitting=useRef(false);
 const [assignedTo,setAssignedTo]=useState(''),[description,setDescription]=useState(''),[reportMode,setReportMode]=useState('complete');
 const [taskType,setTaskType]=useState('standard');
 const [actions,setActions]=useState<{id:string;name:string}[]>([]),[actionId,setActionId]=useState(''),[addingAction,setAddingAction]=useState(false),[loadingActions,setLoadingActions]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[taskId,setTaskId]=useState('');
 const operations=(operation?[operation]:data.operations||[]).filter((o:any)=>o.status!=='cancelled'&&(o.document.checklistId||o.document.checklistRun));
 const ready=operations.length>0&&operations.every((o:any)=>['reviewed','completed'].includes(o.status)&&o.document.checklistRun);
 useEffect(()=>{requestId.current=crypto.randomUUID();const el=dialog.current!;const overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;};},[]);
 useEffect(()=>{const c=new AbortController();apiFetch('/api/service-scheduling/order-task',{signal:c.signal,cache:'reload'}).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error);if(!c.signal.aborted)setActions(body.actions||[]);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoadingActions(false);});return()=>c.abort();},[]);
 function close(){if(busy||addingAction)return;if(!taskId&&(assignedTo||description||actionId)&&!window.confirm('Descartar o preenchimento da tarefa?'))return;onClose();}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(submitting.current||!ready||!actionId||addingAction)return;submitting.current=true;setBusy(true);setError('');
  try{const response=await apiFetch('/api/service-scheduling/order-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:String(data.schedule.id),requestId:requestId.current,...(operation?{operationId:String(operation.id)}:{}),assignedTo,description,reportMode,actionId,...(operation?{taskType}:{})})});const result=await response.json();if(!response.ok)throw Error(result.error);setTaskId(result.taskId);window.dispatchEvent(new Event("order-tasks-updated"));}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a tarefa.');}finally{submitting.current=false;setBusy(false);}
 }
 return <>{createPortal(<dialog ref={dialog} className="scheduling-page operation-review-window order-task-window" aria-label="Gerar tarefa da OS" onCancel={e=>{e.preventDefault();close();}}>
  <header className="operation-review-header"><div><h2>Gerar tarefa da OS {data.detail?.order?.numero_sequencia||data.schedule.order_id}{operation?` · Operação ${String(operation.position).padStart(2,"0")}`:""}</h2><p>{operation?"Encaminhe uma tarefa com o relatório final somente desta operação.":"Encaminhe uma tarefa com o relatório final unificado da OS."}</p></div><button type="button" aria-label="Fechar tarefa da OS" disabled={busy} onClick={close}><X size={20}/></button></header>
  <div className="order-task-content">
   {taskId?<p role="status">Tarefa <a className="order-task-result" href={`/tarefas?task=${encodeURIComponent(taskId)}`} target="_blank" rel="noreferrer">#{taskId}</a> criada com o relatório final anexado.</p>:<form onSubmit={submit}>
    {!ready&&<p role="alert">{operations.length?'Conclua a revisão de todas as operações com relatório para anexar o relatório final.':'Esta OS ainda não possui relatório técnico para anexar.'}</p>}
    <div className="checklist-review-alert-form">
     {operation&&<label>Tipo de tarefa<select disabled={busy} value={taskType} onChange={e=>setTaskType(e.target.value)}><option value="standard">Tarefa de ação</option><option value="approval">Tarefa de aprovação</option></select></label>}
     <label>Responsável pela tarefa<select required disabled={busy} value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}><option value="">Selecione o responsável</option>{(data.users||[]).filter((u:any)=>u.enabled).map((u:any)=><option key={u.email} value={u.email}>{u.display_name||u.email}</option>)}</select></label>
     <label>Relatório anexo<select disabled={busy} value={reportMode} onChange={e=>setReportMode(e.target.value)}><option value="complete">Completo</option><option value="summary">Resumido</option><option value="budget">Orçamento</option></select></label>
     <div><label>Ação da tarefa<select aria-label="Ação da tarefa" required disabled={busy||loadingActions} value={actionId} onChange={e=>{setAddingAction(e.target.value==='__add__');if(e.target.value!=='__add__')setActionId(e.target.value);}}><option value="">{loadingActions?'Carregando ações…':'Selecione a ação'}</option>{actions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}<option value="__add__">+ Adicionar</option></select></label>
     </div>
     <label className="checklist-review-alert-description">Comentário da tarefa<AutoResizeTextarea required disabled={busy} value={description} maxLength={8000} rows={4} onChange={e=>setDescription(e.target.value)} placeholder="Descreva a ação e as orientações para o responsável."/></label>
    </div>
    {error&&<p className="operation-review-error" role="alert">{error}</p>}
    <div className="alert-task-create"><button className="alert-task-create-button" disabled={busy||!ready||!assignedTo||!description.trim()||!actionId||addingAction}><Plus size={18}/>{busy?'Criando tarefa…':'Criar tarefa'}</button><small>{operation?"O PDF inclui somente a operação selecionada.":"O PDF inclui o resumo e as operações na ordem da OS."}</small></div>
   </form>}
  </div>
 </dialog>,document.body)}{addingAction&&<NewTaskActionDialog onClose={()=>setAddingAction(false)} onSaved={action=>{setActions(a=>[...a.filter(v=>v.id!==action.id),action].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));setActionId(action.id);setAddingAction(false);}}/>}</>;
}

function NewTaskActionDialog({onClose,onSaved}:{onClose:()=>void;onSaved:(action:{id:string;name:string})=>void}){
 const dialog=useRef<HTMLDialogElement>(null),submitting=useRef(false);
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
 function close(){if(!submitting.current)onClose();}
 async function save(e:React.FormEvent){
  e.preventDefault();if(submitting.current||!name.trim())return;submitting.current=true;setBusy(true);setError('');
  try{const response=await apiFetch('/api/service-scheduling/order-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add-action',name})});const body=await response.json();if(!response.ok)throw Error(body.error||'Não foi possível salvar a ação.');onSaved(body.action);}
  catch(e){setError((e as Error).message);submitting.current=false;setBusy(false);}
 }
 return createPortal(<dialog ref={dialog} className="scheduling-page order-task-action-dialog" aria-label="Nova ação da tarefa" onCancel={e=>{e.preventDefault();close();}}>
  <header><h2>Nova ação da tarefa</h2><button type="button" aria-label="Fechar nova ação" disabled={busy} onClick={close}><X size={20}/></button></header>
  <form onSubmit={save}><label>Nome da ação<input autoFocus required maxLength={80} disabled={busy} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome da ação"/></label>
   {error&&<p className="operation-review-error" role="alert">{error}</p>}
   <footer><button type="button" disabled={busy} onClick={close}>Cancelar</button><button type="submit" disabled={busy||!name.trim()}>{busy?'Salvando…':'Salvar ação'}</button></footer>
  </form>
 </dialog>,document.body);
}
