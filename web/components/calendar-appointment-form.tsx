"use client";
import {useEffect,useRef,useState} from 'react';
import type {CalendarEvent} from '@/lib/calendar/model';
import ActionNotice from './action-notice';
const kinds={personal:'Compromisso pessoal',leave:'Folga',vacation:'Férias',other:'Outro'};
export default function CalendarAppointmentForm({event,day,email,employees,canManage,onClose,onSaved}:{event?:CalendarEvent;day:string;email:string;employees:{id:string;name:string}[];canManage:boolean;onClose:()=>void;onSaved:()=>void}){
 const a=event?.appointment,dialog=useRef<HTMLDialogElement>(null);
 const [form,setForm]=useState({id:event?.sourceId||crypto.randomUUID(),owner:a?.owner||email,title:event?.title||'',kind:a?.kind||'personal',start:a?.start||day+'T09:00',end:a?.end||day+'T10:00',allDay:a?.allDay||false,visibility:a?.visibility||'team',description:event?.description||'',version:a?.version});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 const editable=!event||!!a?.editable;
 async function save(action:string){setBusy(true);setError('');try{const response=await fetch('/api/calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,action,start:form.allDay?form.start.slice(0,10)+'T00:00':form.start,end:form.allDay?form.end.slice(0,10)+'T23:59':form.end})});const data=await response.json();if(!response.ok)throw Error(data.error);onSaved();}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
 return <dialog ref={dialog} className="calendar-appointment-dialog" aria-label="Compromisso do calendário" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
 <form onSubmit={e=>{e.preventDefault();void save('save');}}>
 <header><h2>{event?'Compromisso':'Novo compromisso'}</h2><button type="button" aria-label="Fechar compromisso" disabled={busy} onClick={onClose}>×</button></header>
 {error&&<ActionNotice onClose={()=>setError('')}>{error}</ActionNotice>}
 <fieldset disabled={busy||!editable}>
 <label>Funcionário<select aria-label="Funcionário" value={form.owner} disabled={!canManage} onChange={e=>setForm({...form,owner:e.target.value})}>{employees.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
 <label>Tipo<select aria-label="Tipo" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{Object.entries(kinds).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 <label>Título<input required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <label><input type="checkbox" checked={form.allDay} onChange={e=>setForm({...form,allDay:e.target.checked})}/>Dia inteiro</label>
 <label>Início<input required type={form.allDay?'date':'datetime-local'} value={form.allDay?form.start.slice(0,10):form.start} onChange={e=>setForm({...form,start:e.target.value+(form.allDay?'T00:00':'')})}/></label>
 <label>Término<input required type={form.allDay?'date':'datetime-local'} value={form.allDay?form.end.slice(0,10):form.end} onChange={e=>setForm({...form,end:e.target.value+(form.allDay?'T23:59':'')})}/></label>
 <label>Visibilidade<select aria-label="Visibilidade" value={form.visibility} onChange={e=>setForm({...form,visibility:e.target.value})}><option value="private">Somente o funcionário</option><option value="team">Equipe</option></select></label>
 <label>Descrição<textarea maxLength={5000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 </fieldset>
 <footer>{editable&&<><button type="submit" disabled={busy}>{busy?'Salvando…':'Salvar compromisso'}</button>{event&&<button type="button" disabled={busy} onClick={()=>{if(confirm('Cancelar este compromisso?'))void save('cancel');}}>Cancelar compromisso</button>}</>}<button type="button" disabled={busy} onClick={onClose}>Fechar</button></footer>
 </form></dialog>;
}
