"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {Plus,X,Search} from 'lucide-react';
import {emailRecipients} from '@/lib/service-scheduling/email-recipients';
const tokens=(value:string)=>value.split(/[;,]/).map(s=>s.trim()).filter((s,i,all)=>s&&all.findIndex(other=>other.toLowerCase()===s.toLowerCase())===i);
export default function EmailRecipientsField({value,draft,onChange,onDraftChange,contacts,disabled,canCreate,onCreate,children}:{value:string;draft:string;onChange:(value:string)=>void;onDraftChange:(value:string)=>void;contacts:any[];disabled:boolean;canCreate:boolean;onCreate:()=>void;children?:React.ReactNode}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[error,setError]=useState(''),[knownEmails,setKnownEmails]=useState(()=>tokens(value));
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),plus=useRef<HTMLButtonElement>(null),id=useId();
 const selected=tokens(value);
 useEffect(()=>{setKnownEmails(previous=>{const next=tokens([...previous,value].join(', '));return next.length===previous.length?previous:next;});},[value]);
 useEffect(()=>{if(!open)return;function outside(e:PointerEvent){if(!root.current?.contains(e.target as Node))setOpen(false);}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 function commit(text=draft){
  if(!text.trim())return true;
  try{const emails=tokens(emailRecipients([value,text].filter(Boolean).join(', ')).join(', '));onChange(emails.join(', '));onDraftChange('');setError('');return true;}catch(e){setError((e as Error).message);return false;}
 }
 function toggle(email:string,checked:boolean){
  if(checked){try{onChange(tokens(emailRecipients([...selected,email].join(', ')).join(', ')).join(', '));setError('');}catch(e){setError((e as Error).message);}}
  else{onChange(selected.filter(item=>item.toLowerCase()!==email.toLowerCase()).join(', '));setError('');}
 }
 const rows=new Map<string,any>();
 for(const contact of contacts)if(contact.email)rows.set(contact.email.toLowerCase(),contact);
 for(const email of tokens([...knownEmails,...selected].join(', ')))if(!rows.has(email.toLowerCase()))rows.set(email.toLowerCase(),{email,name:'Destinatário adicionado'});
 const filtered=[...rows.values()].filter(c=>[c.email,c.name,c.job_title,c.phone].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <div ref={root} className="email-recipients-field" onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);plus.current?.focus();}}}>
  <label htmlFor={id}>Destinatários</label>
  <div className="email-recipients-shell">
   <div className="email-recipient-tokens" onClick={e=>{if(e.target===e.currentTarget)input.current?.focus();}}>
    {selected.map(email=><span key={email.toLowerCase()} className="email-recipient-chip"><span title={email}>{email}</span><button type="button" aria-label={'Remover '+email} title="Remover destinatário" disabled={disabled} onClick={()=>toggle(email,false)}><X size={13}/></button></span>)}
    <input className="email-recipient-entry" ref={input} id={id} aria-label="Destinatários" aria-describedby={id+'-help'} aria-invalid={!!error} type="text" inputMode="email" autoComplete="off" placeholder="Adicionar e-mail…" maxLength={6000} value={draft} disabled={disabled} onChange={e=>{const text=e.target.value;onDraftChange(text);setError('');if(/[;,]$/.test(text))commit(text);}} onBlur={()=>{if(draft.trim())commit();}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if([';',',','Enter'].includes(e.key)){e.preventDefault();commit();}else if(e.key==='Backspace'&&!draft&&selected.length){e.preventDefault();toggle(selected.at(-1)!,false);}}} onPaste={e=>{const text=e.clipboardData.getData('text');if(/[;,\r\n]/.test(text)){e.preventDefault();const merged=(draft+text).replace(/[\r\n]+/g,';');if(!commit(merged))onDraftChange(merged);}}}/>
   </div>
   <button ref={plus} type="button" className="email-recipient-add" aria-label="Selecionar contatos do cliente" title="Selecionar contatos do cliente" aria-expanded={open} aria-controls={id+'-contacts'} disabled={disabled} onClick={()=>setOpen(!open)}><Plus size={20}/></button>
  </div>
  <small id={id+'-help'}>Use ; ou Enter para adicionar um e-mail. O remetente será a conta Gmail autenticada.</small>
  {error&&<p role="alert">{error}</p>}
  {open&&<div id={id+'-contacts'} className="email-recipient-panel" role="region" aria-label="Contatos do cliente">
   <div className="email-recipient-panel-heading"><strong>Contatos e destinatários</strong><button type="button" aria-label="Fechar lista de contatos" onClick={()=>{setOpen(false);plus.current?.focus();}}><X size={16}/></button></div>
   <div className="email-recipient-search"><Search size={16}/><input aria-label="Buscar contato" placeholder="Buscar nome ou e-mail" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <div className="email-recipient-contact-list">{filtered.map(c=><label key={c.email.toLowerCase()} className="email-recipient-contact"><input type="checkbox" disabled={disabled} checked={selected.some(email=>email.toLowerCase()===c.email.toLowerCase())} onChange={e=>toggle(c.email,e.target.checked)}/><span><strong>{c.name||c.email}</strong><span>{c.email}</span>{(c.job_title||c.phone)&&<small>{[c.job_title,c.phone].filter(Boolean).join(' · ')}</small>}</span></label>)}{!filtered.length&&<p>Nenhum contato encontrado.</p>}</div>
   {canCreate&&<button type="button" className="email-recipient-create" disabled={disabled} onClick={onCreate}><Plus size={16}/>Adicionar contato ao cliente</button>}
   {children}
  </div>}
 </div>;
}
