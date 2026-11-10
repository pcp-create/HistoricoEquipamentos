import {brazilDay,type SalesVisit} from './model';
export function visitCalendarDay(visits:SalesVisit[],day:string,today:string){
 const rows=visits.filter(visit=>brazilDay(visit.scheduled_at)===day);
 const completed=rows.filter(visit=>visit.status==='completed').length;
 const pending=rows.filter(visit=>visit.status==='scheduled').length;
 const cancelled=rows.filter(visit=>visit.status==='cancelled').length;
 const tone=pending&&day<today?'overdue':completed&&!pending?'completed':'neutral';
 return {rows,completed,pending,cancelled,tone};
}
