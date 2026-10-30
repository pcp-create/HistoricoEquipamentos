import type {Grain} from './movements';
const monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export type MovementAxisGroup={key:string;label:string;title:string;first:number;last:number};
/** ISO calendar weeks begin on Monday and belong to the year of their Thursday. */
export function calendarWeek(day:string){
 const thursday=new Date(day+'T12:00:00Z');
 thursday.setUTCDate(thursday.getUTCDate()+4-(thursday.getUTCDay()||7));
 const year=thursday.getUTCFullYear(),yearStart=Date.UTC(year,0,1,12);
 return {year,number:Math.ceil(((thursday.getTime()-yearStart)/86400000+1)/7),month:thursday.toISOString().slice(0,7)};
}
export function movementAxis(rows:{date:string}[],grain:Grain){
 const months:MovementAxisGroup[]=[],years:MovementAxisGroup[]=[];
 const append=(groups:MovementAxisGroup[],key:string,label:string,title:string,index:number)=>{
  const last=groups.at(-1);if(last?.key===key)last.last=index;else groups.push({key,label,title,first:index,last:index});
 };
 const labels=rows.map((row,index)=>{
  const week=grain==='week'?calendarWeek(row.date):null;
  // A cross-month week belongs to the month containing its Thursday (the majority of its days).
  const month=week?.month||row.date.slice(0,7),year=String(week?.year||Number(row.date.slice(0,4)));
  if(grain==='day'||grain==='week')append(months,month,monthNames[Number(month.slice(5))-1],`${monthNames[Number(month.slice(5))-1]} de ${year}`,index);
  if(grain!=='year')append(years,year,year,year,index);
  return grain==='day'?row.date.slice(8,10):grain==='week'?`Sem. ${String(week!.number).padStart(2,'0')}`:grain==='month'?monthNames[Number(month.slice(5))-1].slice(0,3):year;
 });
 return {labels,months,years};
}
