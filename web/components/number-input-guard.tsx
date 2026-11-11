"use client";
import {useEffect} from 'react';
/** Keep typed number entry and page scrolling, without browser stepping values. */
export default function NumberInputGuard(){
 useEffect(()=>{
  const numberInput=(target:EventTarget|null)=>target instanceof HTMLInputElement&&target.type==='number';
  const wheel=(event:WheelEvent)=>{if(numberInput(event.target)&&document.activeElement===event.target)(event.target as HTMLInputElement).blur();};
  const key=(event:KeyboardEvent)=>{if(numberInput(event.target)&&['ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();};
  document.addEventListener('wheel',wheel,{capture:true,passive:true});document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('wheel',wheel,true);document.removeEventListener('keydown',key,true);};
 },[]);
 return null;
}
