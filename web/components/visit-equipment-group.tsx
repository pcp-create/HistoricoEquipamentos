"use client";
import {Ban} from 'lucide-react';
import {useState,type ReactNode} from 'react';
export default function VisitEquipmentGroup({customer,equipment,online,prefix='',canInactivate=true,inlineActions=false,render,onInactive,equipmentKey}:{customer?:string;equipment:any[];online:boolean;prefix?:string;canInactivate?:boolean;inlineActions?:boolean;render:(item:any,inactive:boolean,actions:ReactNode)=>ReactNode;onInactive?:(id:string)=>void;equipmentKey?:(item:any)=>string}){
 const [overrides,setOverrides]=useState<Record<string,any>>({}),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const items=equipment.map(item=>({...item,inactivation:overrides[item.id]||item.inactivation}));
 async function inactivate(item:any){
  const reason=window.prompt('Informe a justificativa para inativar este equipamento neste cliente. O status será integrado ao ERP quando houver vínculo confirmado:');
  if(reason===null)return;if(!reason.trim()){setError('Informe a justificativa da inativação.');return;}
  setBusy(item.id);setError('');
  try{
   const r=await fetch('/api/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'inactivate_equipment',customer,equipment:equipmentKey?equipmentKey(item):prefix+item.id,reason})});
   const b=await r.json();if(!r.ok)throw Error(b.error);setOverrides(v=>({...v,[item.id]:b.inactivation}));onInactive?.(item.id);
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 const card=(item:any)=>{
  const actions=!item.inactivation&&canInactivate&&customer?<button type="button" className="visit-equipment-inactivate" aria-label="Inativar equipamento" title="Inativar equipamento" disabled={!online||!!busy} onClick={()=>void inactivate(item)}><Ban size={14} aria-hidden="true"/>{busy===item.id?'Inativando…':'Inativar'}</button>:null;
  return <div key={item.id} className="visit-equipment-entry">{render(item,!!item.inactivation,actions)}{item.inactivation?<p><b>Equipamento inativado</b> · {item.inactivation.source==='m8'?'ERP M8':new Date(item.inactivation.created_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}<br/><span>{item.inactivation.reason}</span></p>:!inlineActions&&actions}</div>;
 };
 return <>{error&&<p role="alert">{error}</p>}{items.filter(i=>!i.inactivation).map(card)}{!!items.filter(i=>i.inactivation).length&&<details className="visit-inactive-equipment"><summary>Expandir equipamentos inativos ({items.filter(i=>i.inactivation).length})</summary>{items.filter(i=>i.inactivation).map(card)}</details>}</>;
}
