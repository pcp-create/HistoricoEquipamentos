"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,ExternalLink} from 'lucide-react';
type Image={key:string;url:string};
export default function M8PhotoUpload({id,name,url,onClose,onPhotos}:{id:string;name:string;url:string;onClose:()=>void;onPhotos:(images:Image[])=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const callbacks=useRef({onClose,onPhotos});callbacks.current={onClose,onPhotos};
 const refresh=useRef<()=>Promise<void>>(async()=>{});
 const [message,setMessage]=useState('As fotos serão consultadas automaticamente após o envio no M8.');
 const [closing,setClosing]=useState(false);
 useEffect(()=>{
  dialog.current?.showModal();
  let disposed=false,pending:Promise<void>|null=null;
  const controller=new AbortController();
  const update=()=>{
   if(pending)return pending;
   pending=(async()=>{
    try{
     const response=await fetch(`/api/products/1/${id}/images?refresh=1`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
     if(!response.ok)throw Error();
     const data=await response.json();
     if(!Array.isArray(data.images))throw Error();
     if(!disposed){callbacks.current.onPhotos(data.images);setMessage('Lista de fotos atualizada. Novas fotos aparecerão quando disponibilizadas pelo M8.');}
    }catch{if(!disposed)setMessage('Não foi possível atualizar as fotos agora. Tentaremos novamente automaticamente.');}
    finally{pending=null;}
   })();return pending;
  };
  refresh.current=update;
  void update();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void update();},10000);
  return()=>{disposed=true;clearInterval(timer);controller.abort();};
 },[id]);
 async function close(){if(closing)return;setClosing(true);await refresh.current();callbacks.current.onClose();}
 return createPortal(<dialog ref={dialog} className="m8-photo-upload" aria-label="Adicionar fotos do equipamento" onCancel={e=>{e.preventDefault();void close();}} onClick={e=>e.stopPropagation()}>
  <header><div><strong>Adicionar fotos · Código {id}</strong><p>{name}</p></div><button type="button" aria-label="Fechar inclusão de fotos" disabled={closing} onClick={()=>void close()}><X/></button></header>
  <iframe src={url} title={`Incluir fotos no M8 — ${id} · ${name}`} allow="camera"/>
  <footer><small role="status">{closing?'Atualizando fotos…':message}</small><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Abrir no M8 em outra aba</a></footer>
 </dialog>,document.body);
}
