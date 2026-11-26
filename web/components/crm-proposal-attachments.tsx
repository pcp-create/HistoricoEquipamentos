'use client';
import {useEffect,useRef,useState} from 'react';
import {FileText,Image as ImageIcon,Paperclip,Trash2,Upload} from 'lucide-react';
import {allowedTaskAttachment,taskAttachmentAccept} from '@/lib/tasks/attachment-types';
import './crm-proposal-attachments.css';

const maxBytes=3*1024*1024;
const address=(proposal:string,id?:string)=>'/api/crm/attachments?'+new URLSearchParams({proposal,...(id?{id}:{})});
const isImage=(filename:string)=>/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(filename);
export default function CrmProposalAttachments({proposalId,onCountChange}:{proposalId:string;onCountChange?:(count:number)=>void}){
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const input=useRef<HTMLInputElement>(null);
 async function refresh(signal?:AbortSignal){const response=await fetch(address(proposalId),{cache:'no-store',signal}),body=await response.json();if(!response.ok)throw Error(body.error||'Não foi possível carregar os anexos.');setRows(body.rows);onCountChange?.(body.rows.length);}
 useEffect(()=>{const controller=new AbortController();setLoading(true);refresh(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[proposalId]);
 async function add(files:File[]){
  if(!files.length)return;setError('');setMessage('');
  if(files.some(file=>!file.size||file.size>maxBytes)){setError('Selecione arquivos não vazios de até 3 MB cada.');return;}
  if(files.some(file=>!allowedTaskAttachment(file.name))){setError('Selecione imagens, PDF ou arquivos do Word, Excel ou PowerPoint.');return;}
  if(rows.length+files.length>20){setError('A proposta pode ter até 20 anexos.');return;}
  setBusy(true);let uploaded=0;
  try{for(const file of files){const body=new FormData();body.set('proposal',proposalId);body.set('file',file);const response=await fetch('/api/crm/attachments',{method:'POST',body}),result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível enviar o anexo.');uploaded++;}setMessage(uploaded===1?'Anexo adicionado.':`${uploaded} anexos adicionados.`);}
  catch(e){setError((uploaded?`${uploaded} arquivo(s) enviado(s). `:'')+(e as Error).message);}
  finally{try{await refresh()}catch(e){setError((e as Error).message)}setBusy(false)}
 }
 async function remove(row:any){if(!window.confirm(`Remover o anexo “${row.filename}”?`))return;setBusy(true);setError('');setMessage('');try{const response=await fetch(address(proposalId,row.id),{method:'DELETE'}),result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível remover o anexo.');await refresh();setMessage('Anexo removido.');}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="crm-proposal-attachments" aria-label="Anexos da proposta">
  <div className="crm-attachments-heading"><div><h2>Anexos da proposta</h2><p>Guarde imagens e documentos relacionados a esta proposta.</p></div><button type="button" className="crm-attachments-upload" disabled={busy||loading||rows.length>=20} onClick={()=>input.current?.click()}><Upload size={17}/>{busy?'Processando…':'Adicionar arquivos'}</button><input ref={input} type="file" aria-label="Selecionar arquivos da proposta" multiple accept={taskAttachmentAccept} hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void add(files)}}/></div>
  <p className="crm-attachments-hint">Até 20 arquivos de 3 MB cada. Os anexos ficam no CRM e não são incluídos automaticamente no PDF ou no e-mail.</p>
  {error&&<p role="alert" className="crm-attachments-error">{error}</p>}{message&&<p role="status" className="crm-attachments-message">{message}</p>}
  {loading?<p>Carregando anexos…</p>:!rows.length?<div className="crm-attachments-empty"><Paperclip size={24}/><strong>Nenhum anexo adicionado</strong><span>Adicione imagens ou documentos para manter as informações junto à proposta.</span></div>:<div className="crm-attachments-list">{rows.map(row=><article key={row.id} className="crm-attachments-item"><a href={address(proposalId,row.id)} target="_blank" rel="noreferrer" className="crm-attachments-file">{isImage(row.filename)?<ImageIcon size={20}/>:<FileText size={20}/>}<span><strong>{row.filename}</strong><small>{Math.ceil(row.size/1024)} KB · {row.created_name} · {new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</small></span></a><button type="button" aria-label={'Remover '+row.filename} title="Remover anexo" disabled={busy} onClick={()=>void remove(row)}><Trash2 size={17}/></button></article>)}</div>}
 </section>;
}
