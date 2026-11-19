"use client";
import {useEffect,useRef,useState} from "react";
import {FileText} from "lucide-react";
import type {Detail} from "@/lib/sales-projection/model";
import {companyName} from "@/lib/company-names";
import ActionNotice from "./action-notice";
const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
export default function OrderCommentsReport({rows,period,disabled=false}:{rows:Detail[];period:string;disabled?:boolean}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[html,setHtml]=useState(''),[since,setSince]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),frame=useRef<HTMLIFrameElement>(null),request=useRef<AbortController|null>(null);
 useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
 useEffect(()=>()=>request.current?.abort(),[]);
 function close(){request.current?.abort();setOpen(false);setBusy(false);setHtml('');setError('');}
 async function generate(){
  if(busy)return;
  setBusy(true);setError('');setHtml('');
  const controller=new AbortController();request.current=controller;
  try {
   const unique=[...new Map([...rows].reverse().filter(r=>r.kind==='salesPending'||r.kind==='salesBilled').map(r=>[`${r.fields?.sourceCompany||r.company}:${r.id}`,r])).values()];
   const sections:string[]=[];let count=0;
   for(const row of unique){
    const comments:any[]=[];let before='';
    do {
     const response=await fetch('/api/service-orders/comments?'+new URLSearchParams({company:String(row.fields?.sourceCompany||row.company),order:String(row.id),...(before?{before}:{})}),{cache:'no-store',signal:controller.signal});
     const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível carregar os comentários.');
     comments.push(...data.rows);const next=data.hasMore?String(data.rows.at(-1)?.id||''):'';
     if(data.hasMore&&(!next||next===before))throw Error('Não foi possível completar a consulta dos comentários.');
     before=next;
    }while(before);
    const selected=comments.filter(c=>!since||new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(c.at))>=since).reverse();
    if(!selected.length)continue;
    count+=selected.length;
    sections.push(`<section><h2>OS ${escape(row.fields?.number||row.id)} · ${escape(row.name)}</h2><p class="meta">${escape(companyName(row.fields?.sourceCompany||row.company))}${row.fields?.equipment?' · '+escape(row.fields.equipment):''}</p>${selected.map(c=>`<article><p class="comment">${escape(c.comment)}</p><p class="meta">${escape(c.author)} · ${escape(date(c.at))}</p></article>`).join('')}</section>`);
   }
   if(!sections.length){setError('Nenhum comentário encontrado para as OSs e datas selecionadas.');return;}
   setHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comentários das OSs — ${escape(period)}</title><style>@page{size:A4;margin:16mm}body{font:14px Arial,sans-serif;color:#203c55;margin:24px}h1{font-size:23px}h2{font-size:16px;margin-bottom:5px;break-after:avoid}section{border-top:1px solid #cbd8e3;margin-top:22px;padding-top:10px}article{padding:8px 0;border-bottom:1px solid #edf0f3}.comment{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0;line-height:1.5}.meta{font-size:11px;color:#63778a}article{break-inside:avoid}@media print{body{margin:0}}</style></head><body><h1>Relatório de comentários das OSs</h1><p>Projeção de vendas · Período: ${escape(period.split('-').reverse().join('/'))}</p><p class="meta">OSs conforme os filtros selecionados · ${sections.length} OSs · ${count} comentários<br>Comentários: ${since?'desde '+escape(since.split('-').reverse().join('/')):'todo o histórico'} · Emitido em ${escape(date(new Date().toISOString()))}</p>${sections.join('')}</body></html>`);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <>
  <button className="button" disabled={disabled||!rows.length} onClick={()=>setOpen(true)}><FileText size={16}/> Relatório de comentários</button>
  {open&&<dialog ref={dialog} className="comments-report-dialog" aria-label="Relatório de comentários" onCancel={e=>{e.preventDefault();close();}}>
   <header><h2>Relatório de comentários</h2><button type="button" onClick={close} aria-label="Fechar relatório">×</button></header>
   <p>Inclui os comentários salvos das OSs que atendem aos filtros da tela.</p>
   <div className="sp-actions"><label>Comentários desde (opcional)<input type="date" value={since} disabled={busy} onChange={e=>{setSince(e.target.value);setHtml('');}}/></label><button className="button" disabled={busy} onClick={()=>void generate()}>{busy?'Preparando…':'Gerar relatório'}</button>{html&&<button className="button" onClick={()=>frame.current?.contentWindow?.print()}>Imprimir / Salvar PDF</button>}</div>
   {error&&<ActionNotice type="error" onClose={()=>setError('')}>{error}</ActionNotice>}
   {html&&<iframe ref={frame} title="Pré-visualização dos comentários" srcDoc={html} sandbox="allow-same-origin allow-modals"/>}
  </dialog>}
 </>;
}
