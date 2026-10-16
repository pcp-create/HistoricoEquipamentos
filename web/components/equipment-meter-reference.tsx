"use client";
import {useEffect,useState} from 'react';
export default function EquipmentMeterReference({equipmentId}:{equipmentId?:string}){
 const [reading,setReading]=useState<{meter:number|null;meterDate:string|null}|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  setReading(null);setError(false);
  if(!equipmentId)return;
  const controller=new AbortController();
  fetch('/api/service-scheduling/equipment?reading='+encodeURIComponent(equipmentId),{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error();return r.json()})
   .then(data=>{if(!controller.signal.aborted)setReading(data)})
   .catch(()=>{if(!controller.signal.aborted)setError(true)});
  return()=>controller.abort();
 },[equipmentId]);
 if(!equipmentId)return null;
 return <small className="checklist-meter-note" role="status">{error?'Não foi possível consultar o horímetro cadastrado.':!reading?'Consultando última coleta…':reading.meter==null?'Nenhuma coleta de horímetro cadastrada nas preventivas.':<>Horímetro cadastrado nas preventivas: <strong>{Number(reading.meter).toLocaleString('pt-BR')} h</strong> · Última coleta: <strong>{reading.meterDate?reading.meterDate.slice(0,10).split('-').reverse().join('/'):'Não informada'}</strong>.</>}</small>;
}
