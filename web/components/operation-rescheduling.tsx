"use client";
import {useEffect, useRef, useState} from "react";
import type {ReschedulingEntry} from "@/lib/service-scheduling/rescheduling";
const date=(value:string)=>value ? value.split("-").reverse().join("/") : "Sem data";
export function ReschedulingHistory({entries,users=[]}:{entries:ReschedulingEntry[];users?:any[]}) {
  const dialog=useRef<HTMLDialogElement>(null);
  if(!entries?.length)return null;
  return <>
    <button type="button" className="rescheduling-badge" onClick={()=>dialog.current?.showModal()} title="Ver histórico de reprogramações">Reprogramada ×{entries.length}</button>
    <dialog ref={dialog} className="rescheduling-dialog" aria-label="Histórico de reprogramações">
      <h3>Histórico de reprogramações</h3>
      <p>{entries.length} {entries.length===1?"reprogramação registrada":"reprogramações registradas"}</p>
      <ol>{entries.map((entry,index)=><li key={index}>
        <strong>#{index+1} · {date(entry.fromDate)} {entry.fromTime} → {date(entry.toDate)} {entry.toTime}</strong>
        <p className="rescheduling-reason">{entry.reason}</p>
        <small>{users.find(user=>user.email===entry.by)?.display_name || entry.by} · {new Date(entry.at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</small>
      </li>)}</ol>
      <button type="button" onClick={()=>dialog.current?.close()}>Fechar</button>
    </dialog>
  </>;
}
export function ReschedulingConfirmation({previous,next,busy,error,onConfirm,onCancel}:{previous:any;next:any;busy:boolean;error?:string;onConfirm:(reason:string)=>void;onCancel:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [reason,setReason]=useState("");
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="rescheduling-dialog" aria-label="Confirmar reprogramação" onCancel={event=>{event.preventDefault();if(!busy)onCancel();}}>
    <h3>Possível reprogramação</h3>
    <p>Esta operação já foi enviada ao técnico. A mudança de data é uma reprogramação?</p>
    <p><strong>{date(previous.date)} {previous.time} → {date(next.date)} {next.time}</strong></p>
    <label>Justificativa da reprogramação<textarea autoFocus required maxLength={2000} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)}/></label>
    <p>A confirmação salva as alterações da operação e registra a data anterior, a justificativa e o responsável pela mudança.</p>
    {error && <p role="alert">{error}</p>}
    <div className="rescheduling-actions">
      <button type="button" disabled={busy} onClick={onCancel}>Cancelar alteração de data</button>
      <button type="button" disabled={busy || !reason.trim() || !next.date} onClick={()=>onConfirm(reason.trim())}>Confirmar e salvar</button>
    </div>
  </dialog>;
}
