"use client";
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ClipboardList,ExternalLink,ChevronRight} from 'lucide-react';
export default function OrderTaskLinks({company,orderId,refreshKey=0,children}:{company:string;orderId:string;refreshKey?:number;children?:ReactNode}){
 const [tasks,setTasks]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  controller.current?.abort();const current=new AbortController();controller.current=current;setLoading(true);setError('');
  try{const response=await fetch(`/api/tasks?orderCompany=${encodeURIComponent(company)}&orderId=${encodeURIComponent(orderId)}`,{cache:'no-store',signal:current.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível consultar as tarefas da OS.');if(!current.signal.aborted)setTasks(data.tasks||[]);}
  catch(e){if(!current.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível consultar as tarefas.');}
  finally{if(!current.signal.aborted)setLoading(false);}
 },[company,orderId]);
 useEffect(()=>{
  let disposed=false;
  setTasks([]);queueMicrotask(()=>{if(!disposed)void load();});
  const onCreated=()=>void load();window.addEventListener('order-tasks-updated',onCreated);
  return()=>{disposed=true;controller.current?.abort();window.removeEventListener('order-tasks-updated',onCreated);};
 },[load,refreshKey]);
 return <section className="order-linked-tasks" aria-label="Tarefas da OS"><details onToggle={event=>{if(event.currentTarget.open)void load();}}><summary><ClipboardList size={18}/><span>Tarefas da OS {!loading&&`(${tasks.length})`}</span><ChevronRight className="order-linked-tasks-chevron" size={18}/></summary>
  {loading?<p role="status">Carregando tarefas…</p>:error?<p role="alert">{error}</p>:!tasks.length?<p>Nenhuma tarefa vinculada a esta OS.</p>:<ul>{tasks.map(task=><li key={task.id}>
   <a href={`/tarefas?task=${encodeURIComponent(task.id)}`} target="_blank" rel="noopener noreferrer">TAR-{task.id} · {task.redacted?'Tarefa restrita':task.title}<ExternalLink size={14}/></a>
   <span className={`order-linked-task-status ${task.status}`}>{({not_started:'Não iniciada',in_progress:'Em andamento',completed:'Concluída'} as Record<string,string>)[task.status]||task.status}</span>
   {!task.redacted&&<small>Responsável: {task.assignee_name||task.assigned_to||'Não atribuído'}</small>}
  </li>)}</ul>}
  {children&&<div className="order-linked-task-actions">{children}</div>}
 </details></section>;
}
