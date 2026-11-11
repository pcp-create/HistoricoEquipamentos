"use client";
import {useState} from 'react';
import {clearApiCache} from '@/lib/client-api-cache';
export default function OrderTypeEquipmentSelect({id,name,required,onSaved,disabled}:{id:string;name:string;required:boolean;onSaved:(value:boolean)=>void;disabled:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div><select aria-label={`Exige equipamento? · ${name}`} value={required?'yes':'no'} disabled={disabled||busy} onChange={async e=>{
  const value=e.target.value==='yes';setBusy(true);setError('');
  try{const response=await fetch('/api/registries/order-types',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,equipment_required:value})});const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível salvar.');clearApiCache();onSaved(data.equipment_required);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}><option value="yes">Sim</option><option value="no">Não</option></select>{busy&&<small role="status">Salvando…</small>}{error&&<p role="alert">{error}</p>}</div>;
}
