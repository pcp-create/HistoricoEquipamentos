"use client";
import {useEquipmentMeterReading,type MeterReadingState} from './use-equipment-meter-reading';
export default function EquipmentMeterReference({equipmentId,state}:{equipmentId?:string;state?:MeterReadingState}){
 const local=useEquipmentMeterReading(state===undefined?equipmentId:undefined);
 const {reading,error}=state??local;
 if(!equipmentId)return null;
 return <small className="checklist-meter-note" role="status">{error?'Não foi possível consultar o horímetro cadastrado.':!reading?'Consultando última coleta…':reading.meter==null?'Nenhuma coleta de horímetro cadastrada nas preventivas.':<>Horímetro cadastrado nas preventivas: <strong>{Number(reading.meter).toLocaleString('pt-BR')} h</strong> · Última coleta: <strong>{reading.meterDate?reading.meterDate.slice(0,10).split('-').reverse().join('/'):'Não informada'}</strong>.</>}</small>;
}
