import {stagesOf} from './checklists';
import {validDate} from '../equipment-management/planning';
export function meterReviewAlerts(run:any,previousMeter:unknown,previousDate?:unknown){
 if(!run?.template)return [];
 if(typeof previousMeter!=='number'||!Number.isFinite(previousMeter))return [];
 return stagesOf(run?.template).flatMap(stage=>stage.fields.filter(field=>field.type==='meter').flatMap(field=>{
  const value=run?.stages?.[stage.id]?.answers?.[field.id];
  if(typeof value!=='number'||!Number.isFinite(value)||value>=previousMeter)return [];
  if(validDate(run.meterDate)&&validDate(previousDate)&&run.meterDate<previousDate)return [];
  return [{stageId:stage.id,fieldId:field.id,label:field.label,value,previousMeter,message:`${field.label}: ${value.toLocaleString('pt-BR')} h informado, abaixo da última coleta de ${previousMeter.toLocaleString('pt-BR')} h. Confira o valor e as datas de coleta antes de concluir a revisão.`}];
 }));
}
