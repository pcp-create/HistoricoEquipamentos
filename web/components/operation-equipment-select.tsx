"use client";
import {useState,useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Search, X, ChevronRight, ChevronLeft, Wrench, Check} from 'lucide-react';
import './operation-equipment-select.css';
export default function OperationEquipmentSelect({value,label,displayLabel,orderLabel,disabled,scheduleId,onChange,globalOnly=false}:{value:string;label:string;displayLabel?:string;orderLabel?:string;disabled:boolean;scheduleId:string;globalOnly?:boolean;onChange:(id:string,equipment?:{equipment_id:string;name:string;serial?:string})=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [open,setOpen]=useState(false),[all,setAll]=useState(globalOnly),[query,setQuery]=useState(''),[offset,setOffset]=useState(0);
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false);
 useEffect(()=>{if(open){dialog.current?.showModal();}return()=>dialog.current?.close();},[open]);
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();setBusy(true);
  const timer=setTimeout(async()=>{try{
   const p=new URLSearchParams({schedule:String(scheduleId),scope:all?'all':'client',q:query,offset:String(offset)});
   const r=await fetch('/api/service-scheduling/equipment?'+p,{signal:controller.signal});
   if(!r.ok)throw Error('Não foi possível buscar equipamentos.');
   const data=await r.json();setRows(data.rows);setMore(data.hasMore);setError('');
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message)}finally{if(!controller.signal.aborted)setBusy(false)}},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[open,all,query,offset,scheduleId]);
 const choose=(id:string)=>{onChange(id,rows.find(e=>e.equipment_id===id));setOpen(false);};
 return <><button type="button" disabled={disabled} onClick={()=>{setAll(globalOnly);setQuery('');setOffset(0);setOpen(true)}}>{displayLabel||(value?(label ? value+' · '+label : value):(orderLabel||'Selecionar equipamento'))}</button>{open&&createPortal(<dialog className="operation-equipment-dialog" ref={dialog} onCancel={()=>setOpen(false)} aria-label="Selecionar equipamento da operação" onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
 <header className="equipment-picker-header"><div><span className="equipment-picker-eyebrow">EQUIPAMENTO DA OPERAÇÃO</span><h3>{all?'Todos os equipamentos':'Equipamentos do cliente'}</h3></div><button className="equipment-picker-close" type="button" aria-label="Fechar" onClick={()=>setOpen(false)}><X size={20}/></button></header>
 <div className="equipment-picker-tools"><label>Pesquisar equipamento<span className="equipment-picker-search"><Search size={18}/><input autoFocus aria-label="Pesquisar equipamento" placeholder="Código, nome ou série" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0)}}/></span></label>{!globalOnly&&<button className="equipment-picker-scope" type="button" onClick={()=>{setAll(!all);setOffset(0)}}>{all?'Somente equipamentos do cliente':'Ver todos os equipamentos'}<ChevronRight size={16}/></button>}</div>
 <div className="equipment-picker-results" aria-busy={busy}>
 {error&&<p role="alert">{error}</p>}{busy?<p className="equipment-picker-empty" role="status">Buscando equipamentos…</p>:<>{!rows.length&&<p className="equipment-picker-empty">Nenhum equipamento encontrado.</p>}<ul>{rows.map(e=><li key={e.equipment_id}><button className={'equipment-picker-item'+(value===e.equipment_id?' selected':'')} type="button" disabled={disabled} onClick={()=>choose(e.equipment_id)}><span className="equipment-picker-icon"><Wrench size={20}/></span><span className="equipment-picker-description"><span className="equipment-picker-code">Cód. {e.equipment_id}</span><strong>{e.name}</strong>{e.serial&&!e.name?.toLowerCase().includes(String(e.serial).toLowerCase())&&<small>Série: {e.serial}</small>}</span>{value===e.equipment_id?<Check size={20}/>:<ChevronRight size={18}/>}</button></li>)}</ul></>}
 </div>
 <footer className="equipment-picker-footer"><button className="equipment-picker-order" type="button" disabled={disabled} onClick={()=>choose('')}>{globalOnly?'Não definir equipamento':'Usar equipamento da OS'}</button><nav aria-label="Páginas de equipamentos"><button type="button" aria-label="Anterior" disabled={busy||!offset} onClick={()=>setOffset(offset-50)}><ChevronLeft size={18}/></button><span>Página {Math.floor(offset/50)+1}</span><button type="button" aria-label="Próxima" disabled={busy||!more} onClick={()=>setOffset(offset+50)}><ChevronRight size={18}/></button></nav></footer>
 </dialog>,document.body)}</>;
}
