"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Plus} from 'lucide-react';
import {apiFetch} from '@/lib/client-api-cache';
import AutoResizeTextarea from './auto-resize-textarea';
export default function OrderTaskWindow({data,onClose}:any){
 const dialog=useRef<HTMLDialogElement>(null),requestId=useRef(''),submitting=useRef(false);
 const [assignedTo,setAssignedTo]=useState(''),[description,setDescription]=useState(''),[reportMode,setReportMode]=useState('complete');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[taskId,setTaskId]=useState('');
 const operations=(data.operations||[]).filter((o:any)=>o.status!=='cancelled'&&(o.document.checklistId||o.document.checklistRun));
 const ready=operations.length>0&&operations.every((o:any)=>['reviewed','completed'].includes(o.status)&&o.document.checklistRun);
 useEffect(()=>{requestId.current=crypto.randomUUID();const el=dialog.current!;const overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;};},[]);
 function close(){if(busy)return;if(!taskId&&(assignedTo||description)&&!window.confirm('Descartar o preenchimento da tarefa?'))return;onClose();}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(submitting.current||!ready)return;submitting.current=true;setBusy(true);setError('');
  try{const response=await apiFetch('/api/service-scheduling/order-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:String(data.schedule.id),requestId:requestId.current,assignedTo,description,reportMode})});const result=await response.json();if(!response.ok)throw Error(result.error);setTaskId(result.taskId);window.dispatchEvent(new Event("order-tasks-updated"));}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a tarefa.');}finally{submitting.current=false;setBusy(false);}
 }
 return createPortal(<dialog ref={dialog} className="scheduling-page operation-review-window order-task-window" aria-label="Gerar tarefa da OS" onCancel={e=>{e.preventDefault();close();}}>
  <header className="operation-review-header"><div><h2>Gerar tarefa da OS {data.detail?.order?.numero_sequencia||data.schedule.order_id}</h2><p>Encaminhe uma tarefa com o relatório final unificado da OS.</p></div><button type="button" aria-label="Fechar tarefa da OS" disabled={busy} onClick={close}><X size={20}/></button></header>
  <div className="order-task-content">
   {taskId?<p role="status">Tarefa <a className="order-task-result" href={`/tarefas?task=${encodeURIComponent(taskId)}`} target="_blank" rel="noreferrer">#{taskId}</a> criada com o relatório final anexado.</p>:<form onSubmit={submit}>
    {!ready&&<p role="alert">{operations.length?'Conclua a revisão de todas as operações com relatório para anexar o relatório final.':'Esta OS ainda não possui relatório técnico para anexar.'}</p>}
    <div className="checklist-review-alert-form">
     <label>Responsável pela tarefa<select required disabled={busy} value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}><option value="">Selecione o responsável</option>{(data.users||[]).filter((u:any)=>u.enabled).map((u:any)=><option key={u.email} value={u.email}>{u.display_name||u.email}</option>)}</select></label>
     <label>Relatório anexo<select disabled={busy} value={reportMode} onChange={e=>setReportMode(e.target.value)}><option value="complete">Completo</option><option value="summary">Resumido</option><option value="budget">Orçamento</option></select></label>
     <label className="checklist-review-alert-description">Comentário da tarefa<AutoResizeTextarea required disabled={busy} value={description} maxLength={8000} rows={4} onChange={e=>setDescription(e.target.value)} placeholder="Descreva a ação e as orientações para o responsável."/></label>
    </div>
    {error&&<p className="operation-review-error" role="alert">{error}</p>}
    <div className="alert-task-create"><button className="alert-task-create-button" disabled={busy||!ready||!assignedTo||!description.trim()}><Plus size={18}/>{busy?'Criando tarefa…':'Criar tarefa'}</button><small>O PDF inclui o resumo e as operações na ordem da OS.</small></div>
   </form>}
  </div>
 </dialog>,document.body);
}
