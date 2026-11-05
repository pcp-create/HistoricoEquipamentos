"use client";
import {useEffect,useRef} from 'react';
import {ArrowRightLeft} from 'lucide-react';
export default function VisitFollowUpPrompt({onChoice}:{onChoice:(direct:boolean)=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="sales-dialog visit-follow-up-dialog" aria-labelledby="visit-follow-up-heading" aria-describedby="visit-follow-up-description" onCancel={e=>{e.preventDefault();onChoice(false);}}>
  <h2 id="visit-follow-up-heading">Pendência da visita</h2>
  <p id="visit-follow-up-description">Existe alguma pendência a ser tratada referente a esta visita? Ao direcionar, a visita será registrada e a mesma tarefa ficará aberta para o responsável selecionado.</p>
  <div className="visit-follow-up-actions"><button type="button" autoFocus className="sales-primary" onClick={()=>onChoice(true)}><ArrowRightLeft size={16} aria-hidden="true"/>Direcionar</button><button type="button" onClick={()=>onChoice(false)}>Fechar</button></div>
 </dialog>;
}
