"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,MessageSquare} from 'lucide-react';
import AutoResizeTextarea from './auto-resize-textarea';
import './order-comments-dialog.css';
export default function OrderCommentsDialog({company,order,number,onClose}:{company:string;order:string;number:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),saving=useRef(false),loading=useRef(false),request=useRef<{id:string;text:string}|null>(null),abort=useRef<AbortController|null>(null);
 const [text,setText]=useState(''),[rows,setRows]=useState<any[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{const element=dialog.current!;element.showModal();void load();return()=>{abort.current?.abort();element.close();};},[]);
 const close=()=>{if(saving.current)return;if(text.trim()&&!window.confirm('Descartar o comentário ainda não salvo?'))return;dialog.current?.close();onClose();};
 async function load(before?:string){
  if(loading.current)return;loading.current=true;setReading(true);setError('');const controller=new AbortController();abort.current=controller;
  try{
   const response=await fetch('/api/service-orders/comments?'+new URLSearchParams({company,order,...(before?{before}:{})}),{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error);
   setRows(old=>before?[...old,...data.rows]:data.rows);setMore(data.hasMore);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{loading.current=false;if(!controller.signal.aborted)setReading(false);}
 }
 async function save(e:React.FormEvent){
  e.preventDefault();if(saving.current||!text.trim())return;saving.current=true;setBusy(true);setError('');setMessage('');
  if(request.current?.text!==text)request.current={id:crypto.randomUUID(),text};
  try{
   const response=await fetch('/api/service-orders/comments',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({company,order,comment:text,requestId:request.current.id})});const data=await response.json();if(!response.ok)throw Error(data.error);
   setText('');request.current=null;setMessage('Comentário registrado no histórico da OS.');await load();
  }catch(e){setError((e as Error).message||'Não foi possível confirmar o registro. Atualize os comentários antes de reenviar.');}finally{saving.current=false;setBusy(false);}
 }
 return createPortal(<dialog ref={dialog} className="order-comments-dialog" aria-label={`Comentários da OS ${number}`} onCancel={e=>{e.preventDefault();close();}}>
  <header><h2><MessageSquare size={20}/>Comentários da OS {number}</h2><button type="button" aria-label="Fechar comentários" disabled={busy} onClick={close}><X size={20}/></button></header>
  <form onSubmit={save}><label>Novo comentário<AutoResizeTextarea rows={3} maxLength={8000} required disabled={busy} value={text} onChange={e=>setText(e.target.value)}/></label><button type="submit" disabled={busy||reading||!text.trim()}>{busy?'Salvando…':'Salvar comentário'}</button><small>O comentário fica no sistema e no histórico de ações da OS.</small></form>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <section aria-label="Todos os comentários da OS"><div className="order-comments-heading"><h3>Todos os comentários</h3><button type="button" disabled={reading||busy} onClick={()=>void load()}>Atualizar comentários</button></div>
   {rows.map(row=><article key={row.id}><p>{row.comment}</p><small><b>{row.author}</b> · <time dateTime={row.at}>{new Date(row.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</time></small></article>)}
   {!reading&&!rows.length&&!error&&<p>Nenhum comentário registrado para esta OS.</p>}{reading&&<p role="status">Carregando comentários…</p>}{more&&<button type="button" disabled={reading||busy} onClick={()=>void load(rows.at(-1)?.id)}>Ver comentários anteriores</button>}
  </section>
 </dialog>,document.body);
}
