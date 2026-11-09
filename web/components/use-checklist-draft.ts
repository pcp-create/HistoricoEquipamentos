"use client";
import {useEffect,useRef,useState} from 'react';
import {recoverReportDraft,readReportDraft,writeReportDraft,reportDraftSignature,sameReportDraft,type ReportStageDraft} from '@/lib/service-scheduling/report-draft';
export function useChecklistDraft(key:string,context:string,server:ReportStageDraft,editable:boolean){
 const [value,setValue]=useState(server),[storageError,setStorageError]=useState('');
 const savingSnapshots=useRef<ReportStageDraft[]>([]);
 const current=useRef(server),base=useRef(server),allowed=useRef(editable);allowed.current=editable;
 const signature=reportDraftSignature(server);
 function persist(next:ReportStageDraft){
  if(!key){setStorageError('Conta não identificada para guardar o rascunho. Reabra o relatório.');return;}
  try{writeReportDraft(localStorage,key,context,base.current,next);setStorageError('');}catch{setStorageError('Não foi possível guardar o rascunho no aparelho. Use Salvar antes de continuar.');}
 }
 useEffect(()=>{
  base.current=server;
  let next=server;
  const acknowledged=savingSnapshots.current.some(snapshot=>sameReportDraft(snapshot,server));
  try{
   const cached=key?readReportDraft(localStorage,key,context):null;
   if(acknowledged){
    next=current.current;savingSnapshots.current=[];
    if(key)writeReportDraft(localStorage,key,context,server,next);
   }else if(cached){
    if(sameReportDraft(cached.value,server)){localStorage.removeItem(key);}
    else if(sameReportDraft(cached.base,server)){next=cached.value;}
    else if(editable){next=recoverReportDraft(cached.base,cached.value,server);writeReportDraft(localStorage,key,context,server,next);}
   }else {}
  }catch{setStorageError('Não foi possível ler o rascunho do aparelho. Use Salvar para confirmar as alterações.');}
  current.current=next;setValue(next);
 },[key,context,signature,editable]);
 function update(patch:Partial<ReportStageDraft>){const next={...current.current,...patch};current.current=next;setValue(next);persist(next);}
 useEffect(()=>{
  const flush=()=>{if(allowed.current&&!sameReportDraft(base.current,current.current))persist(current.current);};
  window.addEventListener('pagehide',flush);window.addEventListener('rj-report-persist',flush);document.addEventListener('visibilitychange',flush);
  return()=>{flush();window.removeEventListener('pagehide',flush);window.removeEventListener('rj-report-persist',flush);document.removeEventListener('visibilitychange',flush);};
 },[key,context]);
 return {value,current,update,beginSave(snapshot:ReportStageDraft){savingSnapshots.current.push(structuredClone(snapshot));},storageError,changed:!sameReportDraft(server,value)};
}
