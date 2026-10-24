"use client";
import {CalendarDays,CalendarPlus,ArrowUpRight} from "lucide-react";
import {isCancelledOrder} from "@/lib/service-scheduling/display-status";
import {useState,useEffect} from "react";
import {apiFetch} from "@/lib/client-api-cache";
export default function HistoryProgrammingAction({company,orderId,orderStatus,scheduleId:initialId,status:initialStatus,label:initialLabel}:{company:number|string;orderId:string;orderStatus?:string|null;scheduleId?:string;status?:string;label?:string}) {
 const cancelled=isCancelledOrder(orderStatus) || initialStatus === "cancelled";
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [resolved,setResolved]=useState<{id?:string;status:string;label:string}|null>(null),[attempt,setAttempt]=useState(0);
 const [lookupError,setLookupError]=useState('');
 useEffect(()=>{
  setResolved(null);setLookupError('');
  if(initialStatus || cancelled)return;
  let disposed=false;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  fetch(`/api/service-scheduling?company=${company}&orderId=${encodeURIComponent(orderId)}`,{cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||'Não foi possível consultar a programação.');if(!body.programming?.status)throw Error('Status não retornado. Tente novamente.');if(!disposed)setResolved(body.programming);})
   .catch(e=>{if(disposed)return;if(!controller.signal.aborted)setLookupError(e.message);else setLookupError('A consulta demorou. Tente novamente.');})
   .finally(()=>clearTimeout(timeout));
  return ()=>{disposed=true;clearTimeout(timeout);controller.abort();};
 },[company,orderId,initialStatus,attempt,cancelled]);
 const status=initialStatus||resolved?.status,label=initialLabel||resolved?.label,scheduleId=initialId||resolved?.id;
 if(cancelled || status === "cancelled")return <span className="history-programming-action cancelled" aria-disabled="true" title="OS cancelada: programação indisponível">OS cancelada</span>;
 if(lookupError)return <><button type="button" className="history-programming-action" onClick={()=>setAttempt(value=>value+1)}>Consultar novamente</button><small role="alert">{lookupError}</small></>;
 if(scheduleId)return <a className={`history-programming-action ${status}`} href={`/programacao?id=${encodeURIComponent(scheduleId)}`} aria-label={`Abrir programação: ${label}`} title={`Abrir programação da OS ${orderId}`}><CalendarDays size={13} aria-hidden="true"/><span>Abrir · {label}</span><ArrowUpRight size={13} aria-hidden="true"/></a>;
 return <><button type="button" className="history-programming-action none" disabled={busy || !status} onClick={async()=>{
  setBusy(true);setError('');try {
   const response=await apiFetch('/api/service-scheduling',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'include',company:Number(company),orderId})});
   const body=await response.json();if(!response.ok)throw Error(body.error || 'Não foi possível programar a OS.');
   if(!body.schedule?.id)throw Error('A programação não foi retornada. Atualize a lista.');
   window.dispatchEvent(new Event('service-schedule-updated'));
   window.location.assign(`/programacao?id=${encodeURIComponent(body.schedule.id)}`);
  }catch(e){setError((e as Error).message);setBusy(false)}
 }}><CalendarPlus size={13} aria-hidden="true"/>{busy?'Programando…':!status?'Consultando…':'Programar'}</button>{error&&<small role="alert">{error}</small>}</>;
}
