"use client";
import {useEffect,useRef,useState} from 'react';
import {readReportDraft,writeReportDraft,reportDraftSignature,sameReportDraft,type ReportStageDraft,type StoredReportDraft} from '@/lib/service-scheduling/report-draft';
export function useChecklistDraft(key:string,context:string,server:ReportStageDraft,editable:boolean){
 const [value,setValue]=useState(server),[storageError,setStorageError]=useState(''),[recovered,setRecovered]=useState(false),[conflict,setConflict]=useState<StoredReportDraft|null>(null);
 const current=useRef(server),base=useRef(server),allowed=useRef(editable);allowed.current=editable;
 const signature=reportDraftSignature(server);
 function persist(next:ReportStageDraft){
  if(!key){setStorageError('Conta não identificada para guardar o rascunho. Reabra o relatório.');return;}
  try{writeReportDraft(localStorage,key,context,base.current,next);setStorageError('');}catch{setStorageError('Não foi possível guardar o rascunho no aparelho. Use Salvar antes de continuar.');}
 }
 useEffect(()=>{
  base.current=server;
  let next=server;
  try{
   const cached=key?readReportDraft(localStorage,key,context):null;
   if(cached){
    if(sameReportDraft(cached.value,server)){localStorage.removeItem(key);setConflict(null);setRecovered(false);}
    else if(editable&&sameReportDraft(cached.base,server)){next=cached.value;setRecovered(true);setConflict(null);}
    else {setConflict(cached);setRecovered(false);}
   }else {setConflict(null);setRecovered(false);}
  }catch{setStorageError('Não foi possível ler o rascunho do aparelho. Use Salvar para confirmar as alterações.');}
  current.current=next;setValue(next);
 },[key,context,signature,editable]);
 function update(patch:Partial<ReportStageDraft>){const next={...current.current,...patch};current.current=next;setValue(next);persist(next);}
 useEffect(()=>{
  const flush=()=>{if(allowed.current&&!sameReportDraft(base.current,current.current))persist(current.current);};
  window.addEventListener('pagehide',flush);window.addEventListener('rj-report-persist',flush);document.addEventListener('visibilitychange',flush);
  return()=>{flush();window.removeEventListener('pagehide',flush);window.removeEventListener('rj-report-persist',flush);document.removeEventListener('visibilitychange',flush);};
 },[key,context]);
 return {value,current,update,storageError,recovered,conflict,restore(){if(!allowed.current||!conflict)return;update(conflict.value);setConflict(null);setRecovered(true);},changed:!sameReportDraft(server,value)};
}
