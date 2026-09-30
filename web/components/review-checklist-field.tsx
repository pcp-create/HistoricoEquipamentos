"use client";
import {useState,useId} from 'react';
import {fieldOptions,photoLimit} from '@/lib/service-scheduling/checklists';
import {apiFetch} from '@/lib/client-api-cache';
export function ReviewFlags({label,options,value,disabled=true,onChange}:{label:string;options:string[];value:any;disabled?:boolean;onChange?:(v:string)=>void}){
 const name=useId();
 return <div className="review-flags" role="radiogroup" aria-label={label}>{options.map(option=><label key={option}><input type="radio" name={name} aria-label={option} checked={value===option} disabled={disabled} onChange={()=>onChange?.(option)}/><span>{option}</span></label>)}</div>;
}
export default function ReviewChecklistField({field:f,value,details,disabled,operationId,stageId,onValue,onDetail,meterDate,onMeterDate,onUploading}:any){
 const [uploading,setUploading]=useState(false),[error,setError]=useState('');
 const locked=disabled||uploading;
 async function upload(files:File[],extra=false){
  if(!files.length)return;
  let ids=[...(extra?details.photos||[]:value||[])];
  const limit=f.type==='signature'&&!extra?1:photoLimit(f);
  setError('');setUploading(true);onUploading(true);
  try{
   if(ids.length+files.length>limit)throw Error(`Este campo permite até ${limit} imagem(ns).`);
   for(const file of files){
    const form=new FormData();form.set('operationId',operationId);form.set('stageId',stageId);form.set('fieldId',f.id);form.set('file',file);
    const res=await apiFetch('/api/service-scheduling/photos',{method:'POST',body:form});const result=await res.json();if(!res.ok)throw Error(result.error);
    ids=[...ids,result.id];if(extra)onDetail('photos',ids);else onValue(ids);
   }
  }catch(e){setError((e as Error).message);}finally{setUploading(false);onUploading(false);}
 }
 const photos=(extra=false)=>{const ids=extra?details.photos||[]:value||[];return <div className="review-edit-photos"><input type="file" aria-label={'Fotos — '+f.label} accept="image/jpeg,image/png,image/webp" multiple={f.type!=='signature'} disabled={locked} onChange={e=>{void upload(Array.from(e.target.files||[]),extra);e.target.value='';}}/>{ids.map((id:string)=><div key={id}><a href={'/api/service-scheduling/photos/'+id} target="_blank" rel="noreferrer"><img src={'/api/service-scheduling/photos/'+id} alt={f.label}/></a><button type="button" disabled={locked} onClick={()=>extra?onDetail('photos',ids.filter((v:string)=>v!==id)):onValue(ids.filter((v:string)=>v!==id))}>Remover imagem</button></div>)}</div>;};
 return <div className="review-edit-field">
 {['flag','select'].includes(f.type)?<ReviewFlags label={f.label} options={fieldOptions(f)} value={value} disabled={locked} onChange={onValue}/>:
 ['photo','signature'].includes(f.type)?photos():
 f.type==='textarea'?<textarea aria-label={f.label} value={value??''} disabled={locked} onChange={e=>onValue(e.target.value)}/>:
 <input aria-label={f.label} type={['number','meter'].includes(f.type)?'number':['date','time'].includes(f.type)?f.type:'text'} step="any" min={f.type==='meter'?0:undefined} value={value??''} disabled={locked} onChange={e=>onValue(['number','meter'].includes(f.type)?e.target.value===''?null:Number(e.target.value):e.target.value)}/>}
 {f.type==='meter'&&<label>Data da leitura<input type="date" aria-label={'Data da leitura — '+f.label} value={meterDate||''} disabled={locked} onChange={e=>onMeterDate(e.target.value)}/></label>}
 {!['photo','signature'].includes(f.type)&&photoLimit(f)>0&&photos(true)}
 {f.comment&&<label>Comentário<textarea aria-label={'Comentário — '+f.label} value={details.comment||''} disabled={locked} onChange={e=>onDetail('comment',e.target.value)}/></label>}
 {f.internalNote&&<label>Observação interna<textarea aria-label={'Observação interna — '+f.label} value={details.internalNote||''} disabled={locked} onChange={e=>onDetail('internalNote',e.target.value)}/></label>}
 {error&&<p role="alert">{error}</p>}
 </div>;
}
