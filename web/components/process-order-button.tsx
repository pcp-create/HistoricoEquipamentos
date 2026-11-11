"use client";
import {useId,useRef,useState} from 'react';
import {BadgeCheck,LoaderCircle} from 'lucide-react';
import {processOrderBlockReason} from '@/lib/service-scheduling/process-order-policy';
import {clearApiCache} from '@/lib/client-api-cache';
import './process-order-button.css';
export default function ProcessOrderButton({data,onChanged,disabled,onBusy}:{data:any;onChanged:()=>void;disabled?:boolean;onBusy?:(busy:boolean)=>void}){
 const tooltipId=useId(),requestId=useRef<string|null>(null),sending=useRef(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[done,setDone]=useState(false),[uncertain,setUncertain]=useState(false);
 const reason=busy?'Aguarde a confirmação do processamento no M8.':done?'Esta OS já está processada.':uncertain?'O M8 não confirmou o resultado. Confira a OS no ERP antes de um novo envio.':disabled?'Aguarde a conclusão da ação em andamento.':!data.canEditSettings?'Você não tem permissão para processar esta OS.':processOrderBlockReason(data.operations||[],data.detail?.order?.status||data.schedule.order_status);
 async function process(){
  if(reason||sending.current)return;
  if(!window.confirm('Processar esta OS no M8? O fluxo será alterado para 19 - OS Faturada e o status para Processado.'))return;
  sending.current=true;setBusy(true);onBusy?.(true);setError('');setMessage('');
  const key='process-order:'+data.schedule.id;
  try{
   if(!requestId.current){try{requestId.current=sessionStorage.getItem(key);}catch{}}
   if(!requestId.current)requestId.current=crypto.randomUUID();
   try{sessionStorage.setItem(key,requestId.current);}catch{}
   let result:any;
   for(let step=0;step<3;step++){
    const response=await fetch('/api/service-scheduling/process-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:String(data.schedule.id),id:requestId.current})});
    result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível confirmar o processamento.');
    requestId.current=result.id;
    try{sessionStorage.setItem(key,result.id);}catch{}
    if(result.state!=='ready')break;
   }
   if(result.state==='complete'){
    setDone(true);setMessage('OS processada no M8. Fluxo: 19 - OS Faturada.');
    try{sessionStorage.removeItem(key);}catch{}
    clearApiCache();onChanged();
   }else{
    if(['uncertain','sending'].includes(result.state))setUncertain(true);
    setError(result.message||'O processamento não foi confirmado. Confira o resultado no M8.');
   }
  }catch(e){setError((e as Error).message);}finally{sending.current=false;setBusy(false);onBusy?.(false);}
 }
 return <div className="process-order-control">
  <span className="process-order-trigger" tabIndex={reason?0:undefined} aria-describedby={reason?tooltipId:undefined}>
   <button type="button" className="process-order-button" disabled={!!reason} onClick={()=>void process()}>{busy?<LoaderCircle className="spin" size={18}/>:<BadgeCheck size={18} aria-hidden="true"/>}Processar OS</button>
   {reason&&<span id={tooltipId} role="tooltip" className="process-order-tooltip">{reason}</span>}
  </span>
  {error&&<p role="alert" className="process-order-error">{error}</p>}
  {message&&<p role="status" className="process-order-success">{message}</p>}
 </div>;
}
