"use client";
import {useEffect,useState} from "react";
import {FileText,LoaderCircle,X} from "lucide-react";
import {nativePortal} from "@/lib/native-portal";
import {offlineMessage} from "./field-offline";
export default function FieldPdfButton({operationId,scheduleId}:{operationId?:string;scheduleId?:string}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [pdfUrl,setPdfUrl]=useState("");
 const [showPdfLink,setShowPdfLink]=useState(false);
 useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl)},[pdfUrl]);
 async function view(mode:string){
  const native=nativePortal();
  const tab=native?null:window.open("", "_blank");
  if(tab){tab.opener=null;tab.document.title="Preparando relatório";tab.document.body.textContent="Gerando PDF…";}
  setBusy(true);setError("");
  try{
   const state=(native||navigator.serviceWorker?.controller)?await offlineMessage("FIELD_STATUS"):{pending:0};
   if(state.pending)throw Error("Sincronize as pendências antes de gerar o PDF para incluir os últimos dados salvos.");
   const url="/api/field/report?"+new URLSearchParams({...operationId?{operationId}:{scheduleId:scheduleId||""},mode});
   if(native)await native.openPdf(url);
   else{
    const response=await fetch(url);if(!response.ok)throw Error((await response.json()).error);
    if(!response.headers.get("content-type")?.includes("application/pdf"))throw Error("O servidor não retornou um PDF. Entre novamente e tente outra vez.");
    const objectUrl=URL.createObjectURL(await response.blob());setPdfUrl(objectUrl);setShowPdfLink(!tab);
    if(tab)tab.location.replace(objectUrl);
   }
   setOpen(false);
  }catch(e){tab?.close();setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="field-pdf-control">
  <button type="button" onClick={()=>{setOpen(!open);setError("")}}><FileText size={16}/> {scheduleId?"Gerar Relatório OS":"PDF"}</button>
  {pdfUrl&&showPdfLink&&<a href={pdfUrl} target="_blank" rel="noopener" className="field-pdf-download">Abrir PDF gerado</a>}
  {open&&<section className="field-pdf-options" aria-label="Visualizar relatório PDF">
   <p>{scheduleId?"Relatório geral da OS, com linha do tempo e todas as operações, inclusive de outros técnicos. ":"Relatório desta operação. "}Dados salvos e sincronizados; antes da revisão, o documento será identificado como prévia.</p>
   <div><button disabled={busy} onClick={()=>void view("complete")}>{busy?<LoaderCircle className="spin" size={16}/>:<FileText size={16}/>} Completo</button><button disabled={busy} onClick={()=>void view("summary")}>Resumido</button><button disabled={busy} onClick={()=>setOpen(false)} aria-label="Fechar opções de PDF"><X size={16}/></button></div>
   {error&&<p role="alert" className="field-error">{error}</p>}
  </section>}
 </div>;
}
