"use client";
import {useEffect,useRef,useState} from "react";
import {Users,Check} from "lucide-react";
import "./team-member-picker.css";
export default function TeamMemberPicker({members,title,description,confirmLabel,onConfirm,onClose}:{
 members:{email:string;display_name?:string}[];title:string;description:string;confirmLabel:string;
 onConfirm:(emails:string[])=>Promise<boolean|void>;onClose:()=>void;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="team-member-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
  <h3><Users size={21}/>{title}</h3><p>{description}</p>
  <fieldset disabled={busy}><legend>Equipe de Apoio</legend>
   {members.map(member=><label key={member.email}><input type="checkbox" checked={selected.includes(member.email)} onChange={event=>setSelected(current=>event.target.checked?[...current,member.email]:current.filter(email=>email!==member.email))}/><span>{member.display_name || member.email}</span></label>)}
  </fieldset>
  {error && <p role="alert">{error}</p>}
  <div className="team-member-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" disabled={busy || !selected.length} onClick={async()=>{
    setBusy(true);setError("");
    try {if(await onConfirm(selected)!==false)onClose();}catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }}><Check size={17}/>{busy?"Salvando…":confirmLabel}</button></div>
 </dialog>;
}
