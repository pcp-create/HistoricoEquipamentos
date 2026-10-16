"use client";
import {useRef,useState,useEffect} from 'react';
import {Camera,ImagePlus,Images,ChevronDown} from 'lucide-react';
import './report-photo-picker.css';
export default function ReportPhotoPicker({label,disabled=false,multiple=true,requiredMissing=false,onSelect}:{label:string;disabled?:boolean;multiple?:boolean;requiredMissing?:boolean;onSelect:(files:File[])=>void}){
 const camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null);
 const trigger=useRef<HTMLButtonElement>(null),scroll=useRef<{element:HTMLDialogElement;top:number}|null>(null);
 const [open,setOpen]=useState(false);
 function launch(input:HTMLInputElement|null){
  const element=trigger.current?.closest('dialog');
  scroll.current=element?{element,top:element.scrollTop}:null;
  setOpen(false);input?.click();
 }
 function restore(){trigger.current?.focus({preventScroll:true});if(scroll.current)scroll.current.element.scrollTop=scroll.current.top;}
 function cancel(event:Event){event.stopPropagation();setOpen(false);restore();}
 useEffect(()=>{
  const inputs=[camera.current,gallery.current];
  for(const input of inputs)input?.addEventListener('cancel',cancel);
  return()=>{for(const input of inputs)input?.removeEventListener('cancel',cancel)};
 },[]);
 function select(event:React.ChangeEvent<HTMLInputElement>){const files=Array.from(event.target.files||[]);event.target.value='';setOpen(false);restore();if(files.length)onSelect(files);}
 return <div className="report-photo-picker" onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});}}}>
 <button className={"report-photo-add"+(requiredMissing?" report-photo-required":"")} title={requiredMissing?"Foto obrigatória pendente":undefined} ref={trigger} type="button" disabled={disabled} aria-label={'Adicionar fotos: '+label} aria-expanded={open&&!disabled} onClick={()=>setOpen(!open)}><ImagePlus size={19}/><span>Adicionar fotos</span><ChevronDown size={16}/></button>
 {open&&!disabled&&<div className="report-photo-choices"><button type="button" onClick={()=>launch(camera.current)}><Camera size={20}/><span>Tirar foto<small>Usar a câmera</small></span></button><button type="button" onClick={()=>launch(gallery.current)}><Images size={20}/><span>Escolher da galeria<small>{multiple?'Selecionar uma ou mais fotos':'Selecionar uma imagem'}</small></span></button></div>}
 <input className="report-photo-native" ref={gallery} tabIndex={-1} type="file" aria-label={'Selecionar fotos: '+label} accept="image/jpeg,image/png,image/webp" multiple={multiple} disabled={disabled} onChange={select}/>
 <input className="report-photo-native" ref={camera} tabIndex={-1} type="file" aria-label={'Tirar foto: '+label} accept="image/*" capture="environment" disabled={disabled} onChange={select}/>
 </div>;
}
