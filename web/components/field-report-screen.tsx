"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft} from 'lucide-react';

export default function FieldReportScreen({open,busy,title,onClose,children}:{open:boolean;busy:boolean;title:string;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 useEffect(()=>{
  if(!mounted)return;
  const element=dialog.current;
  if(!element)return;
  if(!open){element.close();return;}
  const previousOverflow=document.body.style.overflow;
  element.showModal();element.scrollTop=0;
  document.body.style.overflow='hidden';
  return()=>{element.close();document.body.style.overflow=previousOverflow;};
 },[open,mounted]);
 if(!mounted)return null;
 return createPortal(<dialog ref={dialog} className="field-app field-report-screen" aria-label={'Relatório · '+title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <header className="field-report-header"><button type="button" disabled={busy} onClick={onClose} autoFocus><ArrowLeft size={20}/> Voltar</button><div><strong>Relatório</strong><small>{title}</small></div></header>
  <div className="field-report-content">{children}</div>
 </dialog>,document.body);
}
