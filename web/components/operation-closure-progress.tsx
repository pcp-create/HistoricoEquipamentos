'use client';
import {useEffect,useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {pendingTechnicianClosures} from '@/lib/service-scheduling/execution-locks';
import './process-order-button.css';
export default function OperationClosureProgress({operation,users=[],label,className}:{operation:any;users?:any[];label:string;className:string}){
 const id=useId(),[tooltip,setTooltip]=useState<{left:number;top:number;above:boolean}|null>(null);
 const document=operation.document||{},pending=pendingTechnicianClosures(document),partial=!!document.requireTechnicianClosure&&pending.length>0;
 const name=(email:string)=>users.find(user=>user.email===email)?.display_name||email;
 const sent=[...new Set<string>([document.responsible,...(document.support||[])].filter(Boolean))].filter(email=>document.technicianClosures?.[email]);
 useEffect(()=>{
  if(!tooltip)return;
  const close=()=>setTooltip(null),key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
  window.addEventListener('scroll',close,true);window.addEventListener('resize',close);window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close);window.removeEventListener('keydown',key);};
 },[tooltip]);
 function show(el:HTMLElement){if(!partial)return;const b=el.getBoundingClientRect(),width=Math.min(320,window.innerWidth-16),above=b.top>=230;setTooltip({left:Math.max(8,Math.min(b.left,window.innerWidth-width-8)),top:above?b.top-8:b.bottom+8,above});}
 return <><span className={className} tabIndex={partial?0:undefined} aria-describedby={partial&&tooltip?id:undefined} onMouseEnter={e=>show(e.currentTarget)} onMouseLeave={()=>setTooltip(null)} onFocus={e=>show(e.currentTarget)} onBlur={()=>setTooltip(null)}>
  {partial?'Em Execução - envio parcial':label}
 </span>{partial&&tooltip&&createPortal(<span id={id} role="tooltip" className="process-order-tooltip operation-closure-tooltip" style={{left:tooltip.left,top:tooltip.top,transform:tooltip.above?'translateY(-100%)':undefined}}>
  <strong>Envio parcial — em execução</strong>
  {document.checklistRun?.submission?.by&&<span>Relatório enviado por: {name(document.checklistRun.submission.by)}</span>}
  <span>Já encerraram / enviaram: {sent.length?sent.map(name).join(', '):'Nenhum técnico'}</span>
  <span>Pendentes de encerramento / envio: {pending.map(name).join(', ')}</span>
  <span>Revisão aguardando o encerramento de todos os técnicos.</span>
 </span>,window.document.body)}</>;
}
