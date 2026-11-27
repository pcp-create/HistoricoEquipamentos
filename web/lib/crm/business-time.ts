// CRM uses São Paulo time (UTC-3); each weekday contributes 24 hours.
// Weekends are excluded, without a holiday calendar or office-hour restriction.
export function businessMilliseconds(start:number,end:number):number {
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;
 const day=86400000,offset=10800000;
 let cursor=start-offset,finish=end-offset,total=0;
 while(cursor<finish){
  const boundary=(Math.floor(cursor/day)+1)*day;
  const next=Math.min(boundary,finish),weekday=new Date(cursor).getUTCDay();
  if(weekday!==0&&weekday!==6)total+=next-cursor;
  cursor=next;
 }
 return total;
}
