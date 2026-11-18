"use client";
import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,CheckCircle2,X} from 'lucide-react';
import './action-toast.css';
export default function ActionToast({message,type='error',onClose}:{message:string;type?:'error'|'success';onClose:()=>void}){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!message||type!=='success')return;
  const timer=window.setTimeout(()=>close.current(),3000);
  return()=>window.clearTimeout(timer);
 },[message,type]);
 if(!message||typeof document==='undefined')return null;
 return createPortal(<div className={`action-toast action-toast--${type}`} role={type==='error'?'alert':'status'}>
  {type==='error'?<AlertTriangle size={21} aria-hidden="true"/>:<CheckCircle2 size={21} aria-hidden="true"/>}
  <span>{message}</span><button type="button" aria-label="Fechar notificação" onClick={onClose}><X size={19} aria-hidden="true"/></button>
 </div>,document.body);
}
