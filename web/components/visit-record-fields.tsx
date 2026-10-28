"use client";
import type {DraftMachine} from "@/lib/visits/draft-machines";
import {useState} from 'react';
import {Wrench,ChevronDown} from 'lucide-react';
import VisitMachineRegistration from './visit-machine-registration';
export type MachineRecord={equipment:string;note:string;meter?:string;meterDate?:string};
export default function VisitRecordFields({customer,customerName,online,equipment,records,photos,onRecords,onPhotos,onBusy,disabled,draftMachines,onDraftMachines}:{customer?:string;customerName?:string;online:boolean;equipment:{id:string;name:string;model?:string;serial?:string}[];records:MachineRecord[];photos:string[];onRecords:(v:MachineRecord[])=>void;onPhotos:(v:string[])=>void;onBusy:(v:boolean)=>void;disabled:boolean;draftMachines?:DraftMachine[];onDraftMachines?:(machines:DraftMachine[])=>void}){
 const [error,setError]=useState(''),[uploading,setUploading]=useState(false);
 function fields(key:string,label:string,selected:MachineRecord){
  const update=(patch:Partial<MachineRecord>)=>onRecords(records.map(r=>r.equipment===key?{...r,...patch}:r));
  return <div className="visit-machine-record-inputs">
   <label>{label}<textarea required rows={3} maxLength={5000} disabled={disabled} value={selected.note} onChange={e=>update({note:e.target.value})}/></label>
   <div className="visit-machine-meter-fields">
    <label>Horímetro (h)<input type="number" min="0" max="1000000000" step="0.01" disabled={disabled} value={selected.meter||''} required={!!selected.meterDate} onChange={e=>update({meter:e.target.value})}/></label>
    <label>Data da coleta<input type="date" disabled={disabled} value={selected.meterDate||''} required={!!selected.meter} onChange={e=>update({meterDate:e.target.value})}/></label>
   </div>
   <small>Observação e leitura serão registradas no histórico desta visita.</small>
  </div>;
 }
 async function add(files:File[]){
  setError('');if(files.length+photos.length>6){setError('Inclua no máximo 6 fotos.');return;}
  setUploading(true);onBusy(true);
  try{const added:string[]=[];for(const file of files){
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15000000)throw Error('Use fotos JPG, PNG ou WebP de até 15 MB.');
   const bitmap=await createImageBitmap(file);const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const encoded=canvas.toDataURL('image/jpeg',.75);if(encoded.length>1000000)throw Error('Foto muito grande. Escolha uma imagem menor.');added.push(encoded);
  }if([...photos,...added].reduce((sum,p)=>sum+p.length,0)>3500000)throw Error('O conjunto de fotos está muito grande. Remova uma foto ou escolha imagens menores.');onPhotos([...photos,...added]);}catch(e){setError((e as Error).message);}finally{setUploading(false);onBusy(false);}
 }
 return <section className="visit-record-fields">
  <details className="visit-record-machines"><summary><Wrench size={20} aria-hidden="true"/><span className="visit-record-machines-title">Máquinas do cliente <span className="visit-machine-count">({equipment.length+(draftMachines?.length||0)})</span><small>Selecione as máquinas ou cadastre uma nova</small></span><ChevronDown className="visit-machines-chevron" size={18} aria-hidden="true"/></summary><div className="visit-record-machines-body">

  {!equipment.length&&<p>Nenhuma máquina integrada disponível para este cliente.</p>}
  {equipment.map(m=>{const selected=records.find(r=>r.equipment===m.id);return <article className={`visit-machine-record-card${selected?' is-selected':''}`} key={m.id}>
   <label className="visit-machine-record-choice"><input type="checkbox" disabled={disabled} checked={!!selected} onChange={e=>onRecords(e.target.checked?[...records,{equipment:m.id,note:''}]:records.filter(r=>r.equipment!==m.id))}/><span><strong>{m.name}</strong><small>Modelo: {m.model||'Não informado'}</small><small>Série: {m.serial||'Não informada'}</small></span></label>
   {selected&&fields(m.id,`Registro na máquina ${m.id}`,selected)}
  </article>})}
  {customer||onDraftMachines ? <VisitMachineRegistration key={customer||"draft"} customer={customer||"draft"} draftMachines={draftMachines} onDraftMachines={onDraftMachines} name={customerName||"Cliente / Lead"} online={online&&!disabled} renderVisitRecord={m=>{
    const key=`pending:${m.id}`,selected=records.find(r=>r.equipment===key);
    return <div><label className="sales-check"><input type="checkbox" disabled={disabled} checked={!!selected} onChange={e=>onRecords(e.target.checked?[...records,{equipment:key,note:''}]:records.filter(r=>r.equipment!==key))}/>Adicionar observação nesta visita</label>{selected&&fields(key,`Observação da visita · ${m.model}`,selected)}</div>;
  }}/> : <p>Selecione um cliente ou preencha os dados do novo Lead para cadastrar máquinas.</p>}
  </div></details>
  <label>Fotos da visita (até 6)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled||uploading} onChange={e=>{void add(Array.from(e.target.files||[]));e.target.value='';}}/></label>
  {uploading&&<p role="status">Preparando fotos…</p>}{error&&<p role="alert">{error}</p>}
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>{photos.map((src,i)=><div key={i}><img src={src} alt={`Foto ${i+1} da visita`} width={100} height={80} style={{objectFit:'cover'}}/><button type="button" disabled={disabled||uploading} onClick={()=>onPhotos(photos.filter((_,n)=>n!==i))}>Remover foto {i+1}</button></div>)}</div>
 </section>;
}
