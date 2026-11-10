"use client";
import {useId,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {matchesSearch} from '@/lib/filters';
export default function ScheduleMultiFilter({label,options,selected,onChange}:{label:string;options:{id:string;name:string}[];selected?:string[];onChange:(value:string[]|undefined)=>void}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const checked=(key:string)=>selected===undefined||selected.includes(key);
 const all=options.length>0&&options.every(option=>checked(option.id)),some=options.some(option=>checked(option.id));
 function toggle(key:string){const current=options.filter(option=>checked(option.id)).map(option=>option.id),next=checked(key)?current.filter(value=>value!==key):[...current,key];onChange(options.every(option=>next.includes(option.id))?undefined:next);}
 return <div className="scheduling-search schedule-multi-filter">
  <span>{label}</span>
  <button ref={trigger} type="button" className="schedule-multi-filter-trigger" aria-label={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} popoverTarget={id} onClick={()=>{
   const popup=panel.current!;
   setQuery('');const box=trigger.current!.getBoundingClientRect();
   const width=Math.min(Math.max(box.width,280),window.innerWidth-24);
   popup.style.width=width+'px';popup.style.left=Math.max(12,Math.min(box.left,window.innerWidth-width-12))+'px';
   const height=Math.min(380,window.innerHeight-24);popup.style.maxHeight=height+'px';popup.style.top=Math.max(12,Math.min(box.bottom+5,window.innerHeight-height-12))+'px';
  }}><span>{selected===undefined?'Todos':selected.length===1?options.find(option=>option.id===selected[0])?.name||'1 selecionado':`${selected.length} selecionados`}</span><ChevronDown size={16} aria-hidden="true"/></button>
  <div ref={panel} id={id} popover="auto" role="dialog" aria-label={`Filtrar ${label}`} className="schedule-multi-filter-panel" onToggle={e=>setOpen(e.currentTarget.matches(':popover-open'))}>
   <strong>{label}</strong>
   <input type="search" aria-label={`Pesquisar ${label}`} placeholder="Pesquisar" value={query} onChange={e=>setQuery(e.target.value)}/>
   <label><input type="checkbox" checked={all} disabled={!options.length} ref={input=>{if(input)input.indeterminate=some&&!all;}} onChange={e=>onChange(e.target.checked?undefined:[])}/><span>Selecionar todos</span></label>
   <div className="schedule-multi-filter-options">{options.filter(option=>matchesSearch(option.name,query)).map(option=><label key={option.id}><input type="checkbox" checked={checked(option.id)} onChange={()=>toggle(option.id)}/><span>{option.name}</span></label>)}{!options.some(option=>matchesSearch(option.name,query))&&<p>Nenhum resultado encontrado.</p>}</div>
   <button type="button" onClick={()=>onChange(undefined)}>Limpar filtro</button>
  </div>
 </div>;
}
