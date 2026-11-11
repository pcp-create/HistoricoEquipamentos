"use client";
import {useEffect,useState} from 'react';
export type MeterReadingState={reading:{meter:number|null;meterDate:string|null}|null;error:boolean};
export function useEquipmentMeterReading(equipmentId?:string):MeterReadingState{
 const [state,setState]=useState<MeterReadingState&{id?:string}>({reading:null,error:false});
 useEffect(()=>{
  if(!equipmentId)return;
  const controller=new AbortController();
  setState({id:equipmentId,reading:null,error:false});
  fetch('/api/service-scheduling/equipment?reading='+encodeURIComponent(equipmentId),{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error();return r.json();})
   .then(reading=>{if(!controller.signal.aborted)setState({id:equipmentId,reading,error:false});})
   .catch(()=>{if(!controller.signal.aborted)setState({id:equipmentId,reading:null,error:true});});
  return()=>controller.abort();
 },[equipmentId]);
 return state.id===equipmentId?state:{reading:null,error:false};
}
