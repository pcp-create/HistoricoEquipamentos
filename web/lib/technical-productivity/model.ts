import {operationCalendarAllocation} from '../service-scheduling/calendar';
import {timeLogs} from '../service-scheduling/time-logs';

const dayMs=86400000,offset=3*3600000;
export function validMonth(value:string){return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&Number(value.slice(0,4))>=2000&&Number(value.slice(0,4))<=2100;}
export function monthBounds(month:string){if(!validMonth(month))throw Error('Mês inválido.');const [year,n]=month.split('-').map(Number);return {start:month+'-01',end:new Date(Date.UTC(year,n,1)).toISOString().slice(0,10),days:new Date(Date.UTC(year,n,0)).getUTCDate()};}
function dateKey(ms:number){return new Date(ms-offset).toISOString().slice(0,10);}
/** Allocate the existing total reported time, including pauses, by local day. */
export function splitLog(log:any,now=Date.now()){
 const total=Math.max(0,Number(log.total)||0),start=Date.parse(log.started_at||'');
 if(!Number.isFinite(start))return [{date:dateKey(Date.parse(log.recorded_at)),seconds:total}];
 const end=log.finished_at?Date.parse(log.finished_at):now;
 if(!Number.isFinite(end)||end<=start)return [{date:dateKey(start),seconds:total}];
 const pieces:{date:string;seconds:number}[]=[];
 for(let cursor=start;cursor<end;){
  const boundary=(Math.floor((cursor-offset)/dayMs)+1)*dayMs+offset,until=Math.min(end,boundary);
  pieces.push({date:dateKey(cursor),seconds:(until-cursor)/1000});cursor=until;
 }
 const sum=pieces.reduce((n,p)=>n+p.seconds,0);
 if(sum>0)return pieces.map(p=>({...p,seconds:p.seconds*total/sum}));
 return [{date:dateKey(start),seconds:total}];
}
function context(op:any){const doc=op.document||{};return {customer:op.customer||'Cliente não informado',equipment:doc.equipmentUnassigned===true?'Sem equipamento informado':doc.equipment?.label||doc.equipment?.name||(doc.equipmentId?'Equipamento '+doc.equipmentId:op.order_equipment)||'Sem equipamento informado'};}
export function productivityMap(month:string,users:any[],operations:any[],sessions:any[],events:any[],legacy:any[],calendars:any[],now=Date.now()){
 const {start,end,days}=monthBounds(month),map=new Map<string,any>();
 const ensure=(email:string,name?:string)=>{if(!map.has(email))map.set(email,{email,name:name||email,days:{}});return map.get(email);};
 const add=(email:string,date:string,kind:'planned'|'logged',hours:number,detail:any)=>{if(date<start||date>=end||!email||!Number.isFinite(hours)||hours<=0)return;const user=ensure(email),cell=user.days[date] ||= {planned:0,logged:0,details:[]};cell[kind]+=hours;cell.details.push({...detail,kind,hours});};
 users.forEach(u=>ensure(u.email,u.display_name||u.email));
 const byId=new Map(operations.map(o=>[String(o.id),o]));
 for(const op of operations){const doc=op.document||{},calendar=calendars.find((c:any)=>c.id===(doc.calendarId||'standard'));const people=[...new Set<string>([doc.responsible,...(Array.isArray(doc.support)?doc.support:[])].filter(Boolean))];for(const slot of operationCalendarAllocation(doc,calendar))for(const person of people)add(person,slot.date,'planned',slot.minutes/60,{order:op.number||op.order_id,company:op.company_id,operation:op.position,description:doc.description||'',...context(op),start:slot.start,end:slot.end});}
 const logs=timeLogs(sessions,events,legacy,now).rows;
 for(const log of logs){const op:any=byId.get(String(log.operation_id))||log;for(const part of splitLog(log,now))add(log.actor,part.date,'logged',part.seconds/3600,{order:op.number||op.order_id,company:op.company_id,operation:op.position,description:op.document?.description||'',...context(op),start:log.started_at||null,end:log.finished_at||null,recorded:log.recorded_at||null,type:log.kind,manual:!!log.manual});}
 for(const user of map.values())for(const cell of Object.values(user.days) as any[]){
  const time=(item:any)=>{const value=Date.parse(item.start||item.recorded||'');return Number.isFinite(value)?value:Infinity;};
  cell.details.sort((a:any,b:any)=>time(a)-time(b));
 }
 return {month,days,users:[...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))};
}
