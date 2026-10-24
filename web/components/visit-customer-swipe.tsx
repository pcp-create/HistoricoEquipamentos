"use client";
import {useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {MoreHorizontal,X} from "lucide-react";
import type {VisitCustomer} from "@/lib/visits/model";
export default function VisitCustomerSwipe({customer,online,onSaved,children}:{customer:VisitCustomer;online:boolean;onSaved:()=>Promise<void>;children:ReactNode}){
 const start=useRef<{x:number;y:number}|null>(null);
 const [revealed,setRevealed]=useState(false),[dialog,setDialog]=useState(false),[reason,setReason]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function restore(){
  if(busy||!online)return;
  setBusy(true);setError("");
  try {
   const response=await fetch('/api/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'restore_customer',customer_key:customer.key})});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   await onSaved();setRevealed(false);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div className={"visit-swipe "+(revealed?"revealed":"")}>
 {<div className={"visit-swipe-action"+(customer.disqualification?" restore":"")} aria-hidden={!revealed}><button tabIndex={revealed?0:-1} disabled={!online||busy} onClick={()=>{if(customer.disqualification){void restore();return;}setError("");setDialog(true)}}>{busy?"Restaurando…":customer.disqualification?"Restaurar":"Desqualificar"}<br/>{customer.lead?"Lead":"Cliente"}</button></div>}
 <div className="visit-swipe-content" onTouchStart={e=>{const t=e.touches[0];start.current={x:t.clientX,y:t.clientY}}} onTouchEnd={e=>{const t=e.changedTouches[0],p=start.current;start.current=null;if(!p)return;const dx=t.clientX-p.x,dy=t.clientY-p.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)setRevealed(dx<0)}} onTouchCancel={()=>{start.current=null}}>
 {children}
 {<button className="visit-swipe-toggle" aria-label={`Ações de ${customer.name}`} aria-expanded={revealed} onClick={()=>setRevealed(!revealed)}><MoreHorizontal size={18}/></button>}
 </div>
 {error&&!dialog&&<p role="alert" className="sales-error">{error}</p>}
 {dialog&&createPortal(<div className="sales-overlay"><form className="sales-dialog" role="dialog" aria-modal="true" aria-label="Desqualificar cliente ou Lead" onSubmit={async e=>{e.preventDefault();if(busy||!reason.trim())return;setBusy(true);setError("");try{const r=await fetch('/api/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'disqualify',customer_key:customer.key,reason})});const b=await r.json();if(!r.ok)throw Error(b.error);await onSaved();setDialog(false);setRevealed(false)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
 <div className="sales-between"><h2>Desqualificar {customer.lead?"Lead":"cliente"}</h2><button type="button" aria-label="Fechar" disabled={busy} onClick={()=>setDialog(false)}><X/></button></div>
 <p>{customer.name}</p><p>O cadastro será movido para a aba Desqualificado. O histórico e as visitas agendadas serão mantidos.</p>
 <label>Justificativa<textarea autoFocus required maxLength={2000} rows={4} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 {error&&<p role="alert" className="sales-error">{error}</p>}
 <div className="sales-actions"><button type="button" disabled={busy} onClick={()=>setDialog(false)}>Cancelar</button><button className="sales-primary" disabled={busy||!online||!reason.trim()}>{busy?"Salvando…":"Confirmar desqualificação"}</button></div>
 </form></div>,document.body)}
 </div>
}
