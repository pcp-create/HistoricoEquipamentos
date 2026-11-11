export type ScheduleViewPreferences={query:string;overviewView:string;dateView:'delivery'|'operation';deliveryMonth:string;deliveryYear:string;completedExpanded:boolean;stageFilter:string;executors?:string[];programmingStatuses?:string[];flowOwner:string;listSort:{key:string;descending:boolean}|null;calendar:{selected:string;view:'month'|'week'|'day'}|null};
export function defaultSchedulePreferences():ScheduleViewPreferences{
 return {query:'',overviewView:'list',dateView:'delivery',deliveryMonth:'',deliveryYear:new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date()),completedExpanded:false,stageFilter:'',flowOwner:'',listSort:null,calendar:null};
}
export function readSchedulePreferences(raw:string|null):ScheduleViewPreferences{
 const out=defaultSchedulePreferences();
 try{
  const v=JSON.parse(raw||'null');if(!v||typeof v!=='object'||Array.isArray(v))return out;
  for(const k of ['query','stageFilter','flowOwner'] as const)if(typeof v[k]==='string'&&v[k].length<=500)out[k]=v[k];
  if(['list','calendar','map'].includes(v.overviewView))out.overviewView=v.overviewView;
  if(['delivery','operation'].includes(v.dateView))out.dateView=v.dateView;
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(v.deliveryMonth))out.deliveryMonth=v.deliveryMonth;
  if(/^\d{4}$/.test(v.deliveryYear))out.deliveryYear=v.deliveryYear;
  out.completedExpanded=v.completedExpanded===true;
  for(const k of ['executors','programmingStatuses'] as const)if(Array.isArray(v[k])&&v[k].length<=1000&&v[k].every((s:unknown)=>typeof s==='string'&&s.length<=254))out[k]=v[k];
  if(v.listSort&&typeof v.listSort.key==='string'&&typeof v.listSort.descending==='boolean')out.listSort={key:v.listSort.key,descending:v.listSort.descending};
  const day=v.calendar?.selected;
  if(typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day&&['month','week','day'].includes(v.calendar?.view))out.calendar={selected:day,view:v.calendar.view};
 }catch{}
 return out;
}
