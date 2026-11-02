"use client";
import {useEffect,useId,useRef} from 'react';
import {plannedDateSignal} from "@/lib/service-scheduling/planned-date-signal";
import type {PlannedDate} from '@/lib/service-scheduling/planned-date';
export default function SchedulePlannedDate({value}:{value?:PlannedDate}) {
 const id=useId(),button=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const pinned=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const cancel=()=>{if(timer.current)clearTimeout(timer.current);};
 const hide=()=>{cancel();timer.current=setTimeout(()=>{if(!pinned.current)panel.current?.hidePopover();},160);};
 const show=()=>{
  cancel();const anchor=button.current,popup=panel.current;if(!anchor||!popup)return;
  popup.showPopover();const r=anchor.getBoundingClientRect();
  popup.style.left=Math.max(12,Math.min(r.left,window.innerWidth-popup.offsetWidth-12))+'px';
  popup.style.top=Math.max(12,r.bottom+popup.offsetHeight+10>window.innerHeight?r.top-popup.offsetHeight-8:r.bottom+8)+'px';
 };
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const label=value?.date?value.date.split('-').reverse().join('/'):value?.source==='finished'?'—':'A confirmar';
 const signal=plannedDateSignal(value,new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date()));
 return <>
  <button ref={button} type="button" className="schedule-date-explanation" aria-describedby={id} aria-label={`${label} — ${signal.label}`}
    onPointerEnter={e=>{if(e.pointerType==='mouse')show();}} onPointerLeave={hide}
    onFocus={show} onBlur={hide}
    onClick={()=>{if(pinned.current){pinned.current=false;panel.current?.hidePopover();}else{pinned.current=true;show();}}}>
    <span className={`schedule-date-signal is-${signal.state}`} aria-hidden="true" />{label}
  </button>
  <div ref={panel} id={id} popover="auto" role="tooltip" className="schedule-date-popup"
    onPointerEnter={cancel} onPointerLeave={hide}
    onToggle={e=>{if(e.newState==='closed')pinned.current=false;}}>
    <strong>{signal.label}</strong>
    <p>{value?.reason||'Aguardando cálculo da previsão.'}</p>
  </div>
 </>;
}
