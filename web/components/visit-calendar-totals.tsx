import type {visitCalendarDay} from '@/lib/visits/calendar-day';
export default function VisitCalendarTotals({day}:{day:ReturnType<typeof visitCalendarDay>}){
 if(!day.rows.length)return null;
 return <span className="visit-calendar-totals">
  <span><b>{day.completed}</b><span className="visit-count-full"> realizadas</span><span className="visit-count-short"> real.</span></span>
  <span><b>{day.pending}</b><span className="visit-count-full"> pendentes</span><span className="visit-count-short"> pend.</span></span>
  {day.cancelled>0&&<span className="visit-count-cancelled"><b>{day.cancelled}</b><span className="visit-count-full"> canceladas</span><span className="visit-count-short"> canc.</span></span>}
 </span>;
}
