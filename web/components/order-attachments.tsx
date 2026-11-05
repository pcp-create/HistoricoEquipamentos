"use client";
import {useEffect,useState} from 'react';
import './order-attachments.css';
const maxBytes=3*1024*1024;
export async function sendOrderAttachments(company:string,order:string,files:File[],sent:(file:File)=>void){
 for(const file of files){
  const body=new FormData();body.set('company',company);body.set('order',order);body.set('file',file);
  const r=await fetch('/api/service-orders/attachments',{method:'POST',body}),result=await r.json();
  if(!r.ok)throw Error(result.error||'Não foi possível enviar o anexo.');
  sent(file);
 }
}
export default function OrderAttachments({company,order,files:controlled,onFilesChange,disabled=false,onBusy}:{company:string;order?:string;files?:File[];onFilesChange?:(files:File[])=>void;disabled?:boolean;onBusy?:(busy:boolean)=>void}){
 const [own,setOwn]=useState<File[]>([]),[rows,setRows]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
 const files=controlled??own,setFiles=onFilesChange??setOwn;
 useEffect(()=>{
  setRows([]);if(!company||!order)return;
  const controller=new AbortController();
  fetch('/api/service-orders/attachments?'+new URLSearchParams({company,order}),{cache:'no-store',signal:controller.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error);setRows(b.rows);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[company,order,revision]);
 async function upload(){
  if(!order||busy)return;setBusy(true);onBusy?.(true);setError('');setMessage('');
  const remaining=[...files];
  try{await sendOrderAttachments(company,order,files,file=>{remaining.splice(remaining.indexOf(file),1);setFiles([...remaining]);});setMessage('Anexos enviados ao ERP.');setRevision(v=>v+1);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy?.(false);}
 }
 return <section className="order-attachments" aria-label="Anexos da OS">
  <h3>Anexos da OS</h3>
  <p>{order?'Arquivos vinculados à OS no ERP M8.':'Selecione os arquivos. Eles serão enviados ao ERP após a criação da OS.'} Até 3 MB por arquivo.</p>
  <label>Adicionar anexos<input aria-label="Adicionar anexos à OS" type="file" multiple disabled={disabled||busy||!company} onChange={e=>{
   const selected=Array.from(e.target.files||[]);e.target.value='';setError('');
   if(selected.some(f=>!f.size||f.size>maxBytes)){setError('Selecione arquivos não vazios de até 3 MB cada.');return;}
   if(files.length+selected.length>10){setError('Selecione até 10 arquivos por envio.');return;}
   setFiles([...files,...selected]);setMessage('');
  }}/></label>
  {!!files.length&&<ul>{files.map((file,index)=><li key={index}>{file.name} <small>({Math.ceil(file.size/1024)} KB · aguardando envio)</small><button type="button" aria-label={`Remover anexo ${file.name}`} disabled={busy||disabled} onClick={()=>setFiles(files.filter((_,i)=>i!==index))}>Remover</button></li>)}</ul>}
  {order&&!!files.length&&<button type="button" disabled={busy||disabled} onClick={()=>void upload()}>{busy?'Enviando anexos…':'Enviar anexos ao ERP'}</button>}
  {order&&<><button type="button" disabled={busy||disabled} onClick={()=>setRevision(v=>v+1)}>Atualizar anexos</button><ul>{rows.map(row=><li key={row.id}><a href={'/api/service-orders/attachments?'+new URLSearchParams({company,order,id:row.id})}>{row.name}</a></li>)}</ul>{!rows.length&&!error&&<small>Nenhum anexo listado no ERP.</small>}</>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
