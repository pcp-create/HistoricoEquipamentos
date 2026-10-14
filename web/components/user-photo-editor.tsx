"use client";
import {useState} from 'react';
export default function UserPhotoEditor({email}:{email:string}){
 const [revision,setRevision]=useState(0),[missing,setMissing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const url='/api/users/photo?email='+encodeURIComponent(email);
 async function save(file?:File){
  if(file&&(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)){setMessage('Use JPG, PNG ou WebP de até 2 MB.');return}
  setBusy(true);setMessage('');try{
   const r=await fetch(url,{method:file?'POST':'DELETE',...(file?{body:file}:{} )});const b=await r.json();if(!r.ok)throw Error(b.error);
   setMissing(!file);setRevision(v=>v+1);setMessage(file?'Foto salva.':'Foto removida.');
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="user-photo-editor"><h3>Foto do usuário</h3>
  {!missing?<img src={url+'&v='+revision} alt="Foto do usuário" width={80} height={80} style={{objectFit:'cover',borderRadius:12}} onError={()=>setMissing(true)}/>:<p>Sem foto cadastrada.</p>}
  <label>Enviar ou substituir foto<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void save(file);e.target.value=''}}/></label>
  <small>JPG, PNG ou WebP, até 2 MB. A foto é salva separadamente e aparece no cartão do técnico.</small>
  {!missing&&<button type="button" disabled={busy} onClick={()=>void save()}>Remover foto</button>}
  {message&&<p role="status">{message}</p>}
 </section>
}
