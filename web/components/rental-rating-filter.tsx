"use client";
import {useEffect,useRef} from "react";
import {ChevronDown} from "lucide-react";

export default function RentalRatingFilter({unit,options,value,onChange}:{unit:string;options:string[];value:string;onChange:(value:string)=>void}) {
  const root=useRef<HTMLDetailsElement>(null);
  const selected=value.startsWith("exact:")?value.slice(6).split(",").filter(Boolean):[];
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&root.current)root.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&root.current?.open){root.current.open=false;root.current.querySelector("summary")?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return ()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[]);
  return <details ref={root} className="rental-rating-filter">
    <summary aria-label={`Valores específicos de ${unit}`}>{selected.length?`${selected.length} selecionado${selected.length>1?"s":""}`:"Valores"}<ChevronDown size={13} aria-hidden="true"/></summary>
    <div className="rental-rating-options" role="group" aria-label={`Selecionar valores de ${unit}`}>
      <div className="rental-rating-options-header"><strong>{unit}</strong><button type="button" disabled={!selected.length} onClick={()=>onChange("")}>Limpar</button></div>
      <div className="rental-rating-options-list">{options.length?options.map(option=><label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={event=>{const next=event.target.checked?[...selected,option]:selected.filter(v=>v!==option);onChange(next.length?`exact:${next.join(",")}`:"");}}/><span>{option.replace(".",",")} {unit}</span></label>):<small>Nenhum valor informado.</small>}</div>
    </div>
  </details>;
}
