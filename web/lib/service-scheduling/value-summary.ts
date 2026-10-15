import {displayedScheduleStatus} from './display-status';
export function scheduleValueSummary(schedules: any[]) {
  const stages: Record<string,{cents:number;missing:number}> = {};
  let total=0,completed=0,missing=0,openMissing=0;
  for(const schedule of schedules) {
    const status=displayedScheduleStatus(schedule);
    if(status==='cancelled')continue;
    const stage=stages[status] ||= {cents:0,missing:0};
    const raw=schedule.order_value;
    const value=raw==null || raw==='' ? NaN : Number(raw);
    if(!Number.isFinite(value)) {stage.missing++;missing++;if(status!=='completed')openMissing++;continue;}
    const cents=Math.round(value*100);
    stage.cents+=cents;total+=cents;if(status==='completed')completed+=cents;
  }
  return {total:total/100,completed:completed/100,open:(total-completed)/100,missing,openMissing,stages};
}
