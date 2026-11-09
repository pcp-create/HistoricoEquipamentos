"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
export default function TimeLogDeleteDialog({row,onClose,onDeleted}:{row:any;onClose:()=>void;onDeleted:()=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),requestId=useRef(crypto.randomUUID());
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
 return createPortal(<dialog ref={dialog} className="time-adjustment-dialog" aria-label="Excluir apontamento" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <h2>Excluir apontamento?</h2><p>O registro de {row.display_name||row.actor} será removido dos totais de horas e custos. O histórico da exclusão será preservado.</p>
  <label>Motivo da exclusão<textarea aria-label="Motivo da exclusão" autoFocus required maxLength={2000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  <div className="time-adjustment-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" disabled={busy||!reason.trim()} onClick={async()=>{
   setBusy(true);setError('');try{
    const response=await fetch('/api/service-scheduling/time-logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',requestId:requestId.current,operationId:row.operation_id,...(row.legacyEventId?{legacyEventId:String(row.legacyEventId),hours:Number(row.hours)}:{sessionId:row.id,version:Number(row.correction_version||0)}),reason})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível excluir o apontamento.');
    await onDeleted();onClose();
   }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }}>{busy?'Excluindo…':'Confirmar exclusão'}</button></div>
 </dialog>,document.body);
}
