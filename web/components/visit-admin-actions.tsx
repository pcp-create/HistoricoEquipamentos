"use client";
import DateTimePicker from "./date-time-picker";
import {useState} from 'react';
import {Pencil,Trash2,X,Save} from 'lucide-react';
import {brazilDay,type SalesVisit,type VisitPurpose} from '@/lib/visits/model';
const local=(v:string)=>brazilDay(v)+'T'+new Date(v).toLocaleTimeString('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export default function VisitAdminActions({visit,customer,purposes,onSaved,allowDelete=true}:{visit:SalesVisit;customer:string;purposes:VisitPurpose[];onSaved:(message:string)=>Promise<void>;allowDelete?:boolean}){
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [form,setForm]=useState({scheduled_at:'',completed_at:'',contact:'',phone:'',description:'',outcome:'',purpose_id:''});
 function open(){setForm({scheduled_at:local(visit.scheduled_at),completed_at:visit.completed_at?local(visit.completed_at):'',contact:visit.contact,phone:visit.phone,description:visit.description,outcome:visit.outcome,purpose_id:String(visit.purpose_id||'')});setError('');setEditing(true)}
 async function submit(remove=false){
   if(busy)return;
   if(remove && !confirm(`Excluir a visita de ${customer}? Esta ação remove o registro e recalcula os indicadores de visitas.`))return;
   setBusy(true);setError('');
   try{const body=remove?{action:'admin_delete',id:visit.id,version:visit.version}:{...form,action:'admin_edit',id:visit.id,version:visit.version,scheduled_at:new Date(form.scheduled_at+':00-03:00').toISOString(),completed_at:form.completed_at?new Date(form.completed_at+':00-03:00').toISOString():null};
     const r=await fetch('/api/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw Error(b.error);
     setEditing(false);await onSaved(remove?'Visita excluída.':'Visita atualizada.');
   }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <>
 <div className="sales-visit-actions"><button disabled={busy} onClick={open}><Pencil size={16}/>Editar</button>{allowDelete&&<button disabled={busy} onClick={()=>void submit(true)}><Trash2 size={16}/>Excluir</button>}</div>
 {error&&!editing&&<p role="alert" className="sales-error">{error}</p>}
 {editing&&<div className="sales-overlay"><form className="sales-dialog" role="dialog" aria-modal="true" aria-label="Editar visita" onSubmit={e=>{e.preventDefault();void submit()}}>
 <div className="sales-between"><h2>Editar visita</h2><button type="button" disabled={busy} aria-label="Fechar edição" onClick={()=>setEditing(false)}><X/></button></div><p>{customer}</p>
 {error&&<p role="alert" className="sales-error">{error}</p>}
 <div className="sales-form-grid">
 <label>Data e hora agendada<DateTimePicker label="Data e hora agendada" required value={form.scheduled_at} onChange={value=>setForm({...form,scheduled_at:value})}/></label>
 <label>Finalidade da Visita<select aria-label="Finalidade da Visita" required={!!visit.purpose_id} value={form.purpose_id} onChange={e=>setForm({...form,purpose_id:e.target.value})}><option value="">Não informada</option>{visit.purpose_id&&!purposes.some(p=>p.id===String(visit.purpose_id))&&<option value={String(visit.purpose_id)}>{visit.purpose_name || 'Finalidade anterior'} (inativa)</option>}{purposes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Pessoa de contato<input required maxLength={160} value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})}/></label>
 <label>Telefone de contato<input required maxLength={40} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
 </div>
 <label>Descrição / objetivo da visita<textarea rows={4} maxLength={10000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 {visit.status==='completed'&&<><label>Data e hora da realização<DateTimePicker label="Data e hora da realização" required max={local(new Date().toISOString())} value={form.completed_at} onChange={value=>setForm({...form,completed_at:value})}/></label><label>Registro da visita<textarea required rows={4} maxLength={10000} value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}/></label></>}
 <div className="sales-actions"><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button><button className="sales-primary" disabled={busy}><Save size={16}/>{busy?'Salvando…':'Salvar alterações'}</button></div>
 </form></div>}
 </>;
}
