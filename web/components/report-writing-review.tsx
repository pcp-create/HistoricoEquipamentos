"use client";
import {useEffect,useRef,useState} from 'react';
import {Sparkles,Check,X} from 'lucide-react';
import {apiFetch} from '@/lib/client-api-cache';
import {writingFields,WritingSuggestion} from '@/lib/service-scheduling/review-writing';
export default function ReportWritingReview({operation,run,disabled,onApply,onHighlight}:any){
 const [loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [suggestions,setSuggestions]=useState<WritingSuggestion[]>([]);
 const [accepted,setAccepted]=useState<string[]>([]);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>{request.current?.abort();setLoading(false);setSuggestions([]);setAccepted([]);setMessage('');onHighlight([]);return()=>request.current?.abort();},[operation.version]);
 const current=writingFields(run);
 async function review(){
  setLoading(true);setMessage('');setSuggestions([]);setAccepted([]);onHighlight([]);
  const controller=new AbortController();request.current=controller;
  try{
   const response=await apiFetch('/api/service-scheduling/review-writing',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({operationId:operation.id,version:operation.version,fields:current.map(({id,text})=>({id,text}))})});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   if(controller.signal.aborted)return;
   setSuggestions(result.suggestions);onHighlight(result.suggestions);
   setMessage(result.suggestions.length?`${result.suggestions.length} sugestão(ões). Compare os textos antes de aceitar.`:'Nenhuma correção de escrita sugerida.');
  }catch(e){if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:'Não foi possível revisar.');}
  finally{if(!controller.signal.aborted)setLoading(false);}
 }
 function dismiss(s:WritingSuggestion){const next=suggestions.filter(v=>v.id!==s.id);setSuggestions(next);onHighlight(next);}
 return <section className="report-writing-review" aria-label="Revisão de escrita com IA">
  <div className="report-writing-heading"><div><strong>Revisão de escrita</strong><p>Reescrita técnica sugerida pela IA, considerando o contexto dos campos. Confira as informações antes de aceitar. Nada é aplicado automaticamente.</p></div>
   <button type="button" disabled={disabled||loading||!current.length} onClick={()=>void review()}><Sparkles size={16}/>{loading?'Revisando textos…':'Revisar escrita com IA'}</button></div>
  {message&&<p role="status">{message}</p>}
  {suggestions.map(s=>{
   const stale=current.find(f=>f.id===s.id)?.text!==s.text;
   const applied=accepted.includes(s.id);
   return <article key={s.id} className="report-writing-suggestion" aria-label={s.label}>
    <strong>{s.label}</strong><span className="report-writing-tag">{applied?'Sugestão aceita no rascunho':'Sugestão da IA'}</span>
    <div className="report-writing-comparison"><div><small>Original</small><p>{s.text}</p></div><div><small>Sugestão</small><p>{s.suggested}</p></div></div>
    {!applied&&<div className="report-writing-actions"><button type="button" disabled={disabled||stale} onClick={()=>{onApply(s);setAccepted(v=>[...v,s.id]);}}><Check size={16}/>Aceitar sugestão</button><button type="button" disabled={disabled} onClick={()=>dismiss(s)}><X size={16}/>Manter original</button>{stale&&<small>Este campo foi editado. Gere uma nova sugestão para o texto atual.</small>}</div>}
    {applied&&<small>{current.find(f=>f.id===s.id)?.text===s.suggested?'Salve os ajustes para gravar a alteração.':'O texto foi editado manualmente após a sugestão.'}</small>}
   </article>;
  })}
 </section>;
}
