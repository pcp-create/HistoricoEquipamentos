"use client";
import VisitEquipmentGroup from "./visit-equipment-group";
import type {DraftMachine} from "@/lib/visits/draft-machines";
import {useState,useRef} from 'react';
import {Wrench,ChevronDown,X} from 'lucide-react';
import VisitMachineRegistration from './visit-machine-registration';
export type MachineRecord={equipment:string;note:string;meter?:string;meterDate?:string};
export default function VisitRecordFields({customer,customerName,online,equipment,records,photos,onRecords,onPhotos,onBusy,disabled,draftMachines,onDraftMachines}:{customer?:string;customerName?:string;online:boolean;equipment:{id:string;name:string;model?:string;serial?:string}[];records:MachineRecord[];photos:string[];onRecords:(v:MachineRecord[])=>void;onPhotos:(v:string[])=>void;onBusy:(v:boolean)=>void;disabled:boolean;draftMachines?:DraftMachine[];onDraftMachines?:(machines:DraftMachine[])=>void}){
 const drafts=useRef(new Map<string,MachineRecord>());
 function toggle(key:string,checked:boolean){const current=records.find(r=>r.equipment===key);if(current)drafts.current.set(key,{...current});onRecords(checked?[...records,{...(drafts.current.get(key)||{equipment:key,note:''})}]:records.filter(r=>r.equipment!==key));}
 const [error,setError]=useState(''),[uploading,setUploading]=useState(false);
 function fields(key:string,label:string,selected:MachineRecord){
  const update=(patch:Partial<MachineRecord>)=>onRecords(records.map(r=>r.equipment===key?{...r,...patch}:r));
  return <div className="visit-machine-record-inputs">
   <label>{label}<textarea required rows={3} maxLength={5000} disabled={disabled} value={selected.note} onChange={e=>update({note:e.target.value})}/></label>
   <div className="visit-machine-meter-fields">
    <label>Horímetro (h)<input onWheel={e=>e.currentTarget.blur()} type="number" min="0" max="1000000000" step="0.01" disabled={disabled} value={selected.meter||''} required={!!selected.meterDate} onChange={e=>update({meter:e.target.value})}/></label>
    <label>Data da coleta<input type="date" disabled={disabled} value={selected.meterDate||''} required={!!selected.meter} onChange={e=>update({meterDate:e.target.value})}/></label>
   </div>
   <small>Observação e leitura serão registradas no histórico desta visita.</small>
  </div>;
 }
 async function add(files:File[]){
  setError('');if(files.length+photos.length>10){setError('Inclua no máximo 10 fotos.');return;}
  setUploading(true);onBusy(true);
  try{const added:string[]=[];for(const file of files){
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15000000)throw Error('Use fotos JPG, PNG ou WebP de até 15 MB.');
   const bitmap=await createImageBitmap(file);const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let encoded=canvas.toDataURL('image/jpeg',.65);for(const quality of [.5,.35,.2])if(encoded.length>300000)encoded=canvas.toDataURL('image/jpeg',quality);if(encoded.length>300000)throw Error('Foto muito grande. Escolha uma imagem menor.');added.push(encoded);
  }if([...photos,...added].reduce((sum,p)=>sum+p.length,0)>3500000)throw Error('O conjunto de fotos está muito grande. Remova uma foto ou escolha imagens menores.');onPhotos([...photos,...added]);}catch(e){setError((e as Error).message);}finally{setUploading(false);onBusy(false);}
 }
 return <section className="visit-record-fields">
  <details className="visit-record-machines"><summary><Wrench size={20} aria-hidden="true"/><span className="visit-record-machines-title">Máquinas do cliente <span className="visit-machine-count">({equipment.length+(draftMachines?.length||0)})</span><small>Selecione as máquinas ou cadastre uma nova</small></span><ChevronDown className="visit-machines-chevron" size={18} aria-hidden="true"/></summary><div className="visit-record-machines-body">

  {!equipment.length&&<p>Nenhuma máquina integrada disponível para este cliente.</p>}
  <VisitEquipmentGroup customer={customer} equipment={equipment} online={online&&!disabled} onInactive={id=>onRecords(records.filter(r=>r.equipment!==id))} render={(m,inactive)=>{const selected=inactive?undefined:records.find(r=>r.equipment===m.id);return <article className={`visit-machine-record-card${selected?' is-selected':''}`} key={m.id}>
   <label className="visit-machine-record-choice"><input type="checkbox" disabled={disabled||inactive} checked={!!selected} onChange={e=>toggle(m.id,e.target.checked)}/><span><strong>{m.name}</strong><small>Modelo: {m.model||'Não informado'}</small><small>Série: {m.serial||'Não informada'}</small></span></label>
   {selected&&fields(m.id,`Registro na máquina ${m.id}`,selected)}
  </article>}}/>
  {customer||onDraftMachines ? <VisitMachineRegistration key={customer||"draft"} customer={customer||"draft"} draftMachines={draftMachines} onDraftMachines={onDraftMachines} name={customerName||"Cliente / Lead"} online={online&&!disabled} renderVisitRecord={m=>{
    const key=m.equipmentId||`pending:${m.id}`,selected=records.find(r=>r.equipment===key);
    return <div><label className="sales-check"><input type="checkbox" disabled={disabled} checked={!!selected} onChange={e=>toggle(key,e.target.checked)}/>Adicionar observação nesta visita</label>{selected&&fields(key,`Observação da visita · ${m.model}`,selected)}</div>;
  }}/> : <p>Selecione um cliente ou preencha os dados do novo Lead para cadastrar máquinas.</p>}
  </div></details>
  <label>Fotos da visita (até 10)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled||uploading} onChange={e=>{void add(Array.from(e.target.files||[]));e.target.value='';}}/></label>
  {uploading&&<p role="status">Preparando fotos…</p>}{error&&<p role="alert">{error}</p>}
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>{photos.map((src,i)=><div key={i} className="visit-photo-thumb"><img src={src} alt={`Foto ${i+1} da visita`} width={100} height={80} style={{objectFit:'cover'}}/><button type="button" className="visit-photo-remove" aria-label={`Remover foto ${i+1}`} title={`Remover foto ${i+1}`} disabled={disabled||uploading} onClick={()=>onPhotos(photos.filter((_,n)=>n!==i))}><X size={16} aria-hidden="true"/></button></div>)}</div>
 </section>;
}
