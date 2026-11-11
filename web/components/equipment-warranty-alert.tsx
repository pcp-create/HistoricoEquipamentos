"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,X} from 'lucide-react';
import EquipmentWarrantyDetails from './equipment-warranty-details';
import './equipment-warranty-alert.css';
export default function EquipmentWarrantyAlert({equipmentId,company,orderId,compact=false}:{equipmentId:string;company?:string;orderId?:string;compact?:boolean}){
 const [open,setOpen]=useState(false);
 const [state,setState]=useState<{equipment:string;warranty:any;error:string;loading:boolean}>({equipment:'',warranty:null,error:'',loading:false});
 useEffect(()=>{
  setOpen(false);
  if(!equipmentId){setState({equipment:'',warranty:null,error:'',loading:false});return;}
  const controller=new AbortController();setState({equipment:equipmentId,warranty:null,error:'',loading:true});
  const params=new URLSearchParams({equipment:equipmentId});
  if(company&&orderId){params.set('excludeCompany',company);params.set('excludeOrder',orderId);}
  fetch('/api/equipment/warranty?'+params,{signal:controller.signal,cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error);return body.warranty;})
   .then(warranty=>{if(!controller.signal.aborted)setState({equipment:equipmentId,warranty,error:'',loading:false});})
   .catch(e=>{if(!controller.signal.aborted)setState({equipment:equipmentId,warranty:null,error:e.message,loading:false});});
  return()=>controller.abort();
 },[equipmentId,company,orderId]);
 if(!equipmentId||state.equipment!==equipmentId)return null;
 if(state.loading)return <small className="equipment-warranty-loading" role="status">Consultando garantia do equipamento…</small>;
 if(state.error)return <small className="equipment-warranty-error" role="status">{state.error}</small>;
 const warranty=state.warranty;if(!warranty)return null;
 const details=<EquipmentWarrantyDetails warranty={warranty}/>;
 if(!compact)return details;
 return <>
  <button type="button" className="equipment-warranty-trigger" aria-label="Ver alerta de garantia do equipamento" title="Equipamento dentro do período de garantia" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><AlertTriangle size={21} aria-hidden="true"/></button>
  {open&&<WarrantyPopup onClose={()=>setOpen(false)}>{details}</WarrantyPopup>}
 </>;
}
function WarrantyPopup({children,onClose}:{children:React.ReactNode;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
 const close=()=>{dialog.current?.close();onClose();};
 return createPortal(<dialog ref={dialog} className="equipment-warranty-popup" aria-label="Detalhes da garantia do equipamento" onCancel={e=>{e.preventDefault();close();}}>
  <button type="button" className="equipment-warranty-close" aria-label="Fechar alerta de garantia" onClick={close}><X size={20} aria-hidden="true"/></button>
  {children}
 </dialog>,document.body);
}
