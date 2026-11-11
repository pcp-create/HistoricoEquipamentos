export function warrantyPeriod(description:unknown):{amount:number;unit:'days'|'months'|'years'}|null{
 if(typeof description!=='string')return null;
 const match=description.trim().match(/^(\d+)\s*(dias?|mes(?:es)?|m[eê]s|anos?)$/i);
 if(!match||+match[1]<1||+match[1]>36500)return null;
 const unit=/^dia/i.test(match[2])?'days':/^ano/i.test(match[2])?'years':'months';
 return {amount:+match[1],unit};
}
export function warrantyDay(value:unknown):string|null{
 if(!value)return null;
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return Number.isFinite(Date.parse(value))?value:null;
 const date=new Date(value as string|number|Date);
 return Number.isFinite(date.getTime())?date.toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}):null;
}
export function warrantyEnd(start:string,description:unknown):string|null{
 const period=warrantyPeriod(description);if(!period)return null;
 const date=new Date(start+'T12:00:00Z');if(!Number.isFinite(date.getTime()))return null;
 if(period.unit==='days')date.setUTCDate(date.getUTCDate()+period.amount);
 else{
  const day=date.getUTCDate();date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()+period.amount*(period.unit==='years'?12:1));
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last));
 }
 return date.toISOString().slice(0,10);
}
export function activeEquipmentWarranty(rows:any[],today:string){
 const ordered=rows.map(row=>{
  const start=warrantyDay(row.startedAt),explicit=warrantyDay(row.expiresAt);
  const end=explicit||(start?warrantyEnd(start,row.period):null);
  return {...row,startedAt:start,expiresAt:end};
 }).filter(row=>row.startedAt&&row.startedAt<=today)
 .sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||Number(b.orderId)-Number(a.orderId));
 const covered=ordered.find(row=>row.expiresAt&&row.expiresAt>=today);
 return covered?{...covered,lastOrder:ordered[0]}:null;
}
