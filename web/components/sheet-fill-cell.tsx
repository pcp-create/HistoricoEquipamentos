"use client";
import {useEffect,useRef,type ReactNode,type PointerEvent} from 'react';

/** Copies a draft value down the currently rendered rows, never hidden/filter-excluded rows. */
export default function SheetFillCell({children,rowIndex,column,editable,onFill,className=''}:{children:ReactNode;rowIndex:number;column:string;editable:boolean;onFill:(lastRow:number)=>void;className?:string}){
 const cleanup=useRef<()=>void>(()=>{});
 useEffect(()=>()=>cleanup.current(),[]);
 function start(event:PointerEvent<HTMLButtonElement>){
  if(event.button!==0||!editable)return;
  event.preventDefault();event.stopPropagation();
  const cell=event.currentTarget.closest('td')!;
  const table=cell.closest('table')!;
  const scroll=table.closest('.territory-sheet-scroll') as HTMLElement;
  const cells=Array.from(table.querySelectorAll<HTMLElement>('td[data-fill-column]')).filter(item=>item.dataset.fillColumn===column);
  let last=rowIndex;
  const mark=()=>cells.forEach(item=>item.classList.toggle('territory-fill-preview',Number(item.dataset.fillRow)>=rowIndex&&Number(item.dataset.fillRow)<=last));
  const move=(e:globalThis.PointerEvent)=>{
   const bounds=scroll.getBoundingClientRect();
   if(e.clientY>bounds.bottom-28)scroll.scrollTop+=24;
   if(e.clientY<bounds.top+28)scroll.scrollTop-=24;
   const target=document.elementFromPoint(e.clientX,Math.max(bounds.top+1,Math.min(e.clientY,bounds.bottom-1)))?.closest('td');
   if(target?.closest('table')===table&&target?.dataset.fillRow!==undefined){last=Math.max(rowIndex,Number(target.dataset.fillRow));mark();}
  };
  const stop=()=>{cells.forEach(item=>item.classList.remove('territory-fill-preview'));document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',stop);document.removeEventListener('keydown',key);window.removeEventListener('blur',stop);};
  const finish=()=>{stop();if(last>rowIndex)onFill(last);};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')stop();};
  cleanup.current=stop;mark();
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',stop);document.addEventListener('keydown',key);window.addEventListener('blur',stop);
 }
 return <td className={`territory-fill-cell ${className}`} data-fill-row={rowIndex} data-fill-column={column}>{children}{editable&&<button type="button" className="territory-fill-handle" aria-label={`Arrastar para preencher ${column} nas linhas abaixo`} title="Arraste para baixo para copiar o valor. Esc cancela." onPointerDown={start}/>}</td>;
}
