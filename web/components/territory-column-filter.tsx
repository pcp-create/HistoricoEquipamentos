"use client";
import {useId,useRef,useState} from 'react';
import {Filter,ChevronDown,ArrowDownAZ,ArrowUpAZ} from 'lucide-react';
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export default function TerritoryColumnFilter({label,values,selected,onApply,onOpen,onSort,arrowOnly=false}:{arrowOnly?:boolean;onSort:(direction:number)=>void;onOpen:()=>void;label:string;values:string[];selected?:string[];onApply:(values:string[]|undefined)=>void}){
 const id=useId(),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [query,setQuery]=useState(''),[checked,setChecked]=useState<string[]>([]);
 const options=values.filter(value=>fold(value||'(Vazios)').includes(fold(query)));
 const close=()=>{panel.current?.hidePopover();trigger.current?.focus()};
 return <>
 <button ref={trigger} type="button" className="territory-filter-trigger" data-filtered={selected ? "true" : undefined} title={selected ? `Filtro ativo: ${label}` : `Filtrar ${label}`} aria-label={`Filtrar ${label}`} aria-haspopup="dialog" aria-controls={id} onClick={()=>{
  onOpen();setQuery('');setChecked(selected ? selected.filter(value=>values.includes(value)) : values);
  const box=trigger.current!.getBoundingClientRect(),popup=panel.current!;
  popup.style.left=`${Math.max(8,Math.min(box.left,window.innerWidth-296))}px`;
  const height=Math.min(440,window.innerHeight-16);
  popup.style.maxHeight=`${height}px`;
  popup.style.top=`${Math.max(8,Math.min(box.bottom+4,window.innerHeight-height-8))}px`;
  popup.showPopover();
 }}>{selected?<Filter size={arrowOnly ? 14 : 13} aria-hidden="true"/>:<ChevronDown size={13} aria-hidden="true"/>}</button>
 <div ref={panel} id={id} popover="auto" role="dialog" aria-label={`Filtro de ${label}`} className="territory-column-filter">
  <strong>{label}</strong>
  <button type="button" className="territory-filter-sort" onClick={()=>{onSort(1);close()}}><ArrowDownAZ size={16}/>Classificar de A a Z</button>
  <button type="button" className="territory-filter-sort" onClick={()=>{onSort(-1);close()}}><ArrowUpAZ size={16}/>Classificar de Z a A</button>
  <input aria-label="Pesquisar valores" placeholder="Pesquisar valores" value={query} onChange={e=>setQuery(e.target.value)}/>
  <div className="territory-filter-values">
   <label><input type="checkbox" aria-label="Selecionar tudo" disabled={!options.length} checked={options.length>0&&options.every(value=>checked.includes(value))} ref={input=>{if(input)input.indeterminate=options.some(value=>checked.includes(value))&&!options.every(value=>checked.includes(value))}} onChange={e=>setChecked(current=>e.target.checked?[...new Set([...current,...options])]:current.filter(value=>!options.includes(value)))}/><span>(Selecionar tudo)</span></label>
   {options.map(value=><label key={value}><input type="checkbox" checked={checked.includes(value)} onChange={e=>setChecked(current=>e.target.checked?[...current,value]:current.filter(item=>item!==value))}/><span>{value||'(Vazios)'}</span></label>)}{!options.length&&<p>Nenhum valor encontrado.</p>}</div>
  <small>{checked.length} de {values.length} valores selecionados</small>
  <div className="territory-filter-actions"><button type="button" onClick={()=>{onApply(undefined);close()}}>Limpar filtro</button><button type="button" onClick={close}>Cancelar</button><button type="button" className="territory-save" onClick={()=>{onApply(values.length>0&&values.every(value=>checked.includes(value))?undefined:checked.filter(value=>values.includes(value)));close()}}>Aplicar</button></div>
 </div>
 </>;
}
