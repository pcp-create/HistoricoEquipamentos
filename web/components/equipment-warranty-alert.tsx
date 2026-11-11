"use client";
import {useEffect,useState} from 'react';
import {AlertTriangle} from 'lucide-react';
import {companyName} from '@/lib/company-names';
import './equipment-warranty-alert.css';
export default function EquipmentWarrantyAlert({equipmentId,company,orderId}:{equipmentId:string;company?:string;orderId?:string}){
 const [state,setState]=useState<{equipment:string;warranty:any;error:string;loading:boolean}>({equipment:'',warranty:null,error:'',loading:false});
 useEffect(()=>{
  if(!equipmentId){setState({equipment:'',warranty:null,error:'',loading:false});return;}
  const controller=new AbortController();setState({equipment:equipmentId,warranty:null,error:'',loading:true});
  const params=new URLSearchParams({equipment:equipmentId});
  if(company&&orderId){params.set('excludeCompany',company);params.set('excludeOrder',orderId);}
  fetch('/api/equipment/warranty?'+params,{signal:controller.signal,cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error);return body.warranty;})
   .then(warranty=>{if(!controller.signal.aborted)setState({equipment:equipmentId,warranty,error:'',loading:false});})
   .catch(e=>{if(!controller.signal.aborted)setState({equipment:equipmentId,warranty:null,error:e.message,loading:false});});
  return()=>controller.abort();
 },[equipmentId,company,orderId]);
 if(!equipmentId||state.equipment!==equipmentId)return null;
 if(state.loading)return <small className="equipment-warranty-loading" role="status">Consultando garantia do equipamento…</small>;
 if(state.error)return <small className="equipment-warranty-error" role="status">{state.error}</small>;
 const warranty=state.warranty;if(!warranty)return null;
 const date=(day:string)=>day?.split('-').reverse().join('/');
 const orderLink=(o:any)=><a href={`/historico?createdCompany=${o.company}&createdOrder=${o.orderId}`} target="_blank" rel="noreferrer">OS {o.number} · {companyName(o.company)}</a>;
 return <aside className="equipment-warranty-alert" role="note" aria-label="Alerta de garantia do equipamento">
  <AlertTriangle size={18} aria-hidden="true"/>
  <div><strong>Equipamento com atendimento dentro do período de garantia</strong>
   <p>{orderLink(warranty)} · Abertura/emissão: {date(warranty.startedAt)}. Garantia até <b>{date(warranty.expiresAt)}</b>{warranty.period?` (${warranty.period})`:''}.</p>
   <p>Última OS do equipamento: {orderLink(warranty.lastOrder)} · {date(warranty.lastOrder.startedAt)}.</p>
   {warranty.periodSource==='registry'&&<p>Prazo calculado pelo cadastro do tipo de atendimento. Confira a condição aplicada na OS anterior.</p>}
   <p>Avalie se o atendimento solicitado se enquadra na garantia. Este aviso não altera o tipo da OS.</p>
  </div>
 </aside>;
}
