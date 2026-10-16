"use client";
import {useState} from "react";
import {FileText,LoaderCircle,X} from "lucide-react";
import {nativePortal} from "@/lib/native-portal";
import {offlineMessage} from "./field-offline";
export default function FieldPdfButton({operationId,scheduleId}:{operationId?:string;scheduleId?:string}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function view(mode:string){
  setBusy(true);setError("");
  try{
   const state=await offlineMessage("FIELD_STATUS");
   if(!state.connected)throw Error("Conecte à internet para gerar o PDF.");
   if(state.pending)throw Error("Sincronize as pendências antes de gerar o PDF para incluir os últimos dados salvos.");
   const url="/api/field/report?"+new URLSearchParams({...operationId?{operationId}:{scheduleId:scheduleId||""},mode});
   if(nativePortal())await nativePortal()!.openPdf(url);
   else{
    const response=await fetch(url);if(!response.ok)throw Error((await response.json()).error);
    const objectUrl=URL.createObjectURL(await response.blob());const a=document.createElement("a");a.href=objectUrl;a.target="_blank";a.rel="noopener";a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
   }
   setOpen(false);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="field-pdf-control">
  <button type="button" onClick={()=>{setOpen(!open);setError("")}}><FileText size={16}/> Relatório PDF</button>
  {open&&<section className="field-pdf-options" aria-label="Visualizar relatório PDF">
   <p>PDF dos dados salvos e sincronizados. Antes da revisão, o documento será identificado como prévia.</p>
   <div><button disabled={busy} onClick={()=>void view("complete")}>{busy?<LoaderCircle className="spin" size={16}/>:<FileText size={16}/>} Completo</button><button disabled={busy} onClick={()=>void view("summary")}>Resumido</button><button disabled={busy} onClick={()=>setOpen(false)} aria-label="Fechar opções de PDF"><X size={16}/></button></div>
   {error&&<p role="alert" className="field-error">{error}</p>}
  </section>}
 </div>;
}
