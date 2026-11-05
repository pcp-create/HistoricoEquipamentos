"use client";
import {useState,type ReactNode} from 'react';
export default function VisitEquipmentGroup({customer,equipment,online,prefix='',canInactivate=true,render,onInactive}:{customer?:string;equipment:any[];online:boolean;prefix?:string;canInactivate?:boolean;render:(item:any,inactive:boolean)=>ReactNode;onInactive?:(id:string)=>void}){
 const [overrides,setOverrides]=useState<Record<string,any>>({}),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const items=equipment.map(item=>({...item,inactivation:overrides[item.id]||item.inactivation}));
 async function inactivate(item:any){
  const reason=window.prompt('Informe a justificativa para inativar este equipamento no portal de visitas. O cadastro no ERP não será alterado:');
  if(reason===null)return;if(!reason.trim()){setError('Informe a justificativa da inativação.');return;}
  setBusy(item.id);setError('');
  try{
   const r=await fetch('/api/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'inactivate_equipment',customer,equipment:prefix+item.id,reason})});
   const b=await r.json();if(!r.ok)throw Error(b.error);setOverrides(v=>({...v,[item.id]:b.inactivation}));onInactive?.(item.id);
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 const card=(item:any)=><div key={item.id} className="visit-equipment-entry">{render(item,!!item.inactivation)}{item.inactivation?<p><b>Equipamento inativado</b> · {new Date(item.inactivation.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}<br/><span>{item.inactivation.reason}</span></p>:canInactivate&&customer&&<button type="button" disabled={!online||!!busy} onClick={()=>void inactivate(item)}>{busy===item.id?'Inativando…':'Inativar equipamento'}</button>}</div>;
 return <>{error&&<p role="alert">{error}</p>}{items.filter(i=>!i.inactivation).map(card)}{!!items.filter(i=>i.inactivation).length&&<details className="visit-inactive-equipment"><summary>Expandir equipamentos inativos ({items.filter(i=>i.inactivation).length})</summary>{items.filter(i=>i.inactivation).map(card)}</details>}</>;
}
