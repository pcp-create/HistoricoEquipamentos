"use client";
import {useState} from 'react';
import {Pencil,Save,X} from 'lucide-react';
import type {VisitCustomer} from '@/lib/visits/model';
import ActionNotice from './action-notice';
export default function VisitLeadSeller({customer,sellers=[],canEdit=false,online=true,onSaved}:{customer:VisitCustomer;sellers?:{id:string;name:string}[];canEdit?:boolean;online?:boolean;onSaved:()=>void|Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [choices,setChoices]=useState<{id:string;name:string}[]>([]),[seller,setSeller]=useState(''),[expectedOwner,setExpectedOwner]=useState('');
 const names=(customer.seller_ids||[]).map((id,index)=>customer.seller_names?.[index]||sellers.find(s=>s.id===id)?.name||id).join(', ')||'Não atribuído';
 async function edit(){
  setBusy(true);setError('');
  try{const r=await fetch('/api/visits/lead-seller?customer='+encodeURIComponent(customer.key),{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setChoices(b.sellers);setSeller(b.owner);setExpectedOwner(b.owner);setOpen(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function save(){
  if(busy)return;setBusy(true);setError('');
  try{const r=await fetch('/api/visits/lead-seller',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer_key:customer.key,seller,expectedOwner})});const b=await r.json();if(!r.ok)throw Error(b.error);setOpen(false);await onSaved();setMessage('Vendedor responsável pelo lead atualizado.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="visit-lead-seller">
  <p className="sales-muted visit-lead-seller-label">Vendedor: {names}{customer.lead&&canEdit&&<button type="button" className="visit-lead-seller-edit" aria-label="Alterar vendedor responsável pelo lead" title="Alterar vendedor responsável pelo lead" disabled={busy||!online} onClick={()=>void edit()}><Pencil size={14}/></button>}</p>
  {open&&<section className="visit-lead-seller-form" aria-label="Alterar responsável do lead">
   <label>Vendedor responsável pelo lead<select aria-label="Vendedor responsável pelo lead" value={seller} disabled={busy} onChange={e=>setSeller(e.target.value)}><option value="">Selecione o vendedor</option>{!choices.some(s=>s.id===expectedOwner)&&<option value={expectedOwner} disabled>{names} (atual)</option>}{choices.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <small>A alteração muda o responsável pelo lead. As visitas já registradas mantêm o vendedor original.</small>
   <div><button type="button" disabled={busy||!online||!seller||seller===expectedOwner} onClick={()=>void save()}><Save size={15}/>Salvar responsável</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}><X size={15}/>Cancelar</button></div>
  </section>}
  {error&&<ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}
  {message&&<ActionNotice type="success" onClose={()=>setMessage('')}>{message}</ActionNotice>}
 </div>;
}
