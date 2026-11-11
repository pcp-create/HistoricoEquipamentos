"use client";
import RequiredMarker from "./required-marker";
import AutoResizeTextarea from "./auto-resize-textarea";
import ReportPhotoPicker from "./report-photo-picker";
import EquipmentMeterReference from "./equipment-meter-reference";
import {prepareReportPhoto} from "@/lib/prepare-report-photo";
import {useState,useId,useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {hasAlertComment,requiresAlertComment,isStatusField,fieldOptions,photoLimit} from '@/lib/service-scheduling/checklists';
import {apiFetch} from '@/lib/client-api-cache';
export function ReviewFlags({label,options,value,alertOptions=[],disabled=true,onChange}:{label:string;options:string[];value:any;alertOptions?:string[];disabled?:boolean;onChange?:(v:string)=>void}){
 const name=useId();
 return <div className="review-flags" role="radiogroup" aria-label={label}>{options.map(option=><label key={option} className={value===option&&(option.trim().toUpperCase()==="NOK"||alertOptions.includes(option))?"status-alert-selected":undefined}><input type="radio" name={name} aria-label={option} checked={value===option} disabled={disabled} onChange={()=>onChange?.(option)}/><span>{option}</span></label>)}</div>;
}
function PhotoRemovalConfirmation({disabled,onCancel,onConfirm}:{disabled:boolean;onCancel:()=>void;onConfirm:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
 return createPortal(<dialog ref={dialog} className="review-photo-confirm" aria-labelledby={id} onCancel={e=>{e.preventDefault();if(!disabled)onCancel();}}>
  <h3 id={id}>Remover foto do relatório?</h3>
  <p>Confirma a remoção desta foto? A alteração só será aplicada ao salvar os ajustes do relatório.</p>
  <div><button type="button" disabled={disabled} onClick={onCancel} autoFocus>Cancelar</button><button type="button" className="review-photo-confirm-remove" disabled={disabled} onClick={onConfirm}>Remover foto</button></div>
 </dialog>,document.body);
}
export default function ReviewChecklistField({field:f,value,details,disabled,operationId,stageId,onValue,onDetail,meterDate,onMeterDate,onUploading,equipmentId,meterReference,meterWarning}:any){
 const [uploading,setUploading]=useState(false),[error,setError]=useState('');
 const warningId=useId();
 const locked=disabled||uploading;
 const [removal,setRemoval]=useState<{id:string;extra:boolean}|null>(null);
 async function upload(files:File[],extra=false){
  if(!files.length)return;
  let ids=[...(extra?details.photos||[]:value||[])];
  const limit=f.type==='signature'&&!extra?1:photoLimit(f);
  setError('');setUploading(true);onUploading(true);
  try{
   if(ids.length+files.length>limit)throw Error(`Este campo permite até ${limit} imagem(ns).`);
   for(const file of files){
    const form=new FormData();form.set('operationId',operationId);form.set('stageId',stageId);form.set('fieldId',f.id);form.set('file',await prepareReportPhoto(file));
    const res=await apiFetch('/api/service-scheduling/photos',{method:'POST',body:form});const result=await res.json();if(!res.ok)throw Error(result.error);
    ids=[...ids,result.id];if(extra)onDetail('photos',ids);else onValue(ids);
   }
  }catch(e){setError((e as Error).message);}finally{setUploading(false);onUploading(false);}
 }
 const photos=(extra=false)=>{const ids=extra?details.photos||[]:value||[];return <div className="review-edit-photos">
  {ids.map((id:string,index:number)=><div className="review-photo-card" key={id}><a href={'/api/service-scheduling/photos/'+id} target="_blank" rel="noreferrer"><img src={'/api/service-scheduling/photos/'+id} alt={`${f.label} — ${index+1}`}/></a><button type="button" className="review-photo-remove" aria-label={`Remover foto ${index+1} — ${f.label}`} title="Remover foto" disabled={locked} onClick={()=>setRemoval({id,extra})}><X size={16} aria-hidden="true"/></button></div>)}
  <ReportPhotoPicker variant="card" label={f.label} requiredMissing={!extra&&f.type==='photo'&&f.required&&ids.length===0} multiple={f.type!=='signature'} disabled={locked} onSelect={files=>void upload(files,extra)}/>
 </div>;};
 return <div className="review-edit-field">
 {(isStatusField(f.type)||f.type==='select')?<ReviewFlags label={f.label} options={fieldOptions(f)} alertOptions={f.alertOptions} value={value} disabled={locked} onChange={onValue}/>:
 ['photo','signature'].includes(f.type)?photos():
 f.type==='textarea'?<AutoResizeTextarea aria-label={f.label} value={value??''} disabled={locked} onChange={e=>onValue(e.target.value)}/>:
 <input aria-label={f.label} aria-invalid={meterWarning?true:undefined} aria-describedby={meterWarning?warningId:undefined} className={meterWarning?"review-meter-invalid":undefined} type={['number','meter'].includes(f.type)?'number':['date','time'].includes(f.type)?f.type:'text'} step="any" min={f.type==='meter'?0:undefined} value={value??''} disabled={locked} onChange={e=>onValue(['number','meter'].includes(f.type)?e.target.value===''?null:Number(e.target.value):e.target.value)}/>}
 {f.type==='meter'&&<EquipmentMeterReference equipmentId={equipmentId} state={meterReference}/>}
 {meterWarning&&<p id={warningId} className="review-meter-regression-note">{meterWarning}</p>}
 {f.type==='meter'&&equipmentId&&<label>Data da leitura<input type="date" aria-label={'Data da leitura — '+f.label} value={meterDate||''} disabled={locked} onChange={e=>onMeterDate(e.target.value)}/></label>}
 {!['photo','signature'].includes(f.type)&&photoLimit(f)>0&&photos(true)}
 {(f.comment||hasAlertComment(f))&&<label><span>Comentário{requiresAlertComment(f,value)&&<> <RequiredMarker/></>}</span><AutoResizeTextarea required={requiresAlertComment(f,value)} aria-invalid={requiresAlertComment(f,value)&&!details.comment?.trim()} placeholder={requiresAlertComment(f,value)?"Preenchimento obrigatório":undefined} className={requiresAlertComment(f,value)&&!details.comment?.trim()?"alert-comment-empty":undefined} aria-label={'Comentário — '+f.label} value={details.comment||''} disabled={locked} onChange={e=>onDetail('comment',e.target.value)}/></label>}
 {f.internalNote&&<label>Observação interna<AutoResizeTextarea aria-label={'Observação interna — '+f.label} value={details.internalNote||''} disabled={locked} onChange={e=>onDetail('internalNote',e.target.value)}/></label>}
 {removal&&<PhotoRemovalConfirmation disabled={!!locked} onCancel={()=>setRemoval(null)} onConfirm={()=>{
  const ids=removal.extra?details.photos||[]:value||[];
  if(removal.extra)onDetail('photos',ids.filter((id:string)=>id!==removal.id));else onValue(ids.filter((id:string)=>id!==removal.id));
  setRemoval(null);
 }}/>}
 {error&&<p role="alert">{error}</p>}
 </div>;
}
