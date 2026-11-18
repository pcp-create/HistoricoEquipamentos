"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,CheckCircle2,X} from 'lucide-react';
import './action-toast.css';
const regions=new WeakMap<HTMLElement,{element:HTMLDivElement;count:number}>();
function acquireRegion(target:HTMLElement){
 let region=regions.get(target);
 if(!region){const element=document.createElement('div');element.className='action-toast-region';element.setAttribute('aria-label','Notificações');target.appendChild(element);region={element,count:0};regions.set(target,region);}
 region.count++;
 return {element:region.element,release:()=>{if(--region!.count===0){region!.element.remove();regions.delete(target);}}};
}
export default function ActionToast({message,type='error',onClose,actions}:{message:string;type?:'error'|'success';onClose:()=>void;actions?:ReactNode}){
 const close=useRef(onClose);close.current=onClose;
 const anchor=useRef<HTMLSpanElement>(null),[container,setContainer]=useState<HTMLDivElement|null>(null);
 const visible=!!message;
 useEffect(()=>{
  if(!visible)return;
  // Notifications from modal forms must remain inside the active top layer,
  // otherwise showModal makes the close button inert behind the dialog.
  const modals=document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  const target=anchor.current?.closest<HTMLDialogElement>('dialog[open]') || modals[modals.length-1] || document.body;
  const region=acquireRegion(target);setContainer(region.element);
  return region.release;
 },[visible]);
 useEffect(()=>{
  if(!message||type!=='success')return;
  const timer=window.setTimeout(()=>close.current(),3000);
  return()=>window.clearTimeout(timer);
 },[message,type]);
 return <><span ref={anchor} hidden/>{message&&container&&createPortal(<div className={`action-toast action-toast--${type}`} role={type==='error'?'alert':'status'}>
  {type==='error'?<AlertTriangle size={21} aria-hidden="true"/>:<CheckCircle2 size={21} aria-hidden="true"/>}
  <span>{message}</span>{actions&&<div className="action-toast-actions">{actions}</div>}<button type="button" aria-label="Fechar notificação" onClick={onClose}><X size={19} aria-hidden="true"/></button>
 </div>,container)}</>;
}
