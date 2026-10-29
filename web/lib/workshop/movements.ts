export type Grain = 'year' | 'month' | 'week' | 'day';
export type VisitMovement = { source?: { entry_reversed?: boolean }; entered_at: string; exited_at?: string | null; reconciled_out_at?: string | null };
export function localDay(value: string) {
  if (!Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'}).format(new Date(value));
}
function bucket(day:string, grain:Grain) {
  if(grain==='year') return day.slice(0,4)+'-01-01';
  if(grain==='month') return day.slice(0,7)+'-01';
  if(grain==='day') return day;
  const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
export function movements(visits:VisitMovement[],start:string,end:string,grain:Grain) {
  const bins=new Map<string,{date:string;entries:number;exits:number}>();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end) return [];
  const cursor=new Date(bucket(start,grain)+'T12:00:00Z');
  for(let i=0;i<3700&&cursor.toISOString().slice(0,10)<=end;i++){
    const day=cursor.toISOString().slice(0,10); bins.set(day,{date:day,entries:0,exits:0});
    if(grain==='year')cursor.setUTCFullYear(cursor.getUTCFullYear()+1);
    else if(grain==='month')cursor.setUTCMonth(cursor.getUTCMonth()+1);
    else cursor.setUTCDate(cursor.getUTCDate()+(grain==='week'?7:1));
  }
  for(const visit of visits.filter(v=>!v.source?.entry_reversed)) for(const [field,key] of [['entered_at','entries'],['exited_at','exits']] as const){
    const value=visit[field];if(!value)continue;
    const day=localDay(value);if(day<start||day>end)continue;
    const bin=bins.get(bucket(day,grain));if(bin)bin[key]++;
  }
  return [...bins.values()];
}

export function workshopEvolution(visits:VisitMovement[],start:string,end:string,grain:Grain) {
 visits=visits.filter(v=>!v.source?.entry_reversed);
 const rows=movements(visits,start,end,grain);
 const dates=visits.map(v=>({entered:localDay(v.entered_at),closed:[v.exited_at,v.reconciled_out_at].filter(Boolean).map(v=>localDay(v!)).filter(Boolean).sort()[0]}));
 return rows.map((row,index)=>{
  const next=rows[index+1]?.date;
  const endDate=next?new Date(Date.parse(next+'T12:00:00Z')-86400000).toISOString().slice(0,10):end;
  const startDate=row.date<start?start:row.date;
  const opening=dates.filter(v=>v.entered&&v.entered<startDate&&(!v.closed||v.closed>=startDate)).length;
  const adjustments=visits.filter(v=>{const day=v.reconciled_out_at?localDay(v.reconciled_out_at):'';return day>=startDate&&day<=endDate&&(!v.exited_at||day<localDay(v.exited_at));}).length;
  return {...row,startDate,endDate,opening,adjustments,occupancy:dates.filter(v=>v.entered&&v.entered<=endDate&&(!v.closed||v.closed>endDate)).length};
 });
}
