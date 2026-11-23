"use client";
import {useEffect} from 'react';
let locks=0;
let restore:(()=>void)|undefined;
export default function useModalScrollLock(open:boolean){
 useEffect(()=>{
  if(!open)return;
  if(locks++===0){
   const body=document.body,root=document.documentElement,x=window.scrollX,y=window.scrollY;
   const previous={position:body.style.position,top:body.style.top,left:body.style.left,width:body.style.width,overflow:body.style.overflow,rootOverflow:root.style.overflow};
   body.style.position='fixed';body.style.top=`-${y}px`;body.style.left=`-${x}px`;body.style.width='100%';body.style.overflow='hidden';root.style.overflow='hidden';
   restore=()=>{Object.assign(body.style,{position:previous.position,top:previous.top,left:previous.left,width:previous.width,overflow:previous.overflow});root.style.overflow=previous.rootOverflow;window.scrollTo(x,y);};
  }
  return()=>{if(--locks===0){restore?.();restore=undefined;}};
 },[open]);
}
