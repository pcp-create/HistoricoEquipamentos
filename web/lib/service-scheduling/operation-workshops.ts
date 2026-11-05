import 'server-only';
import {equipmentWorkshopStatus} from '../workshop/equipment-status';
/** Resolve the actual equipment selected for each operation, never another machine on its OS. */
export async function attachOperationWorkshops(schedules:any[]){
 const idFor=(schedule:any,operation:any)=>String(operation.equipmentId||schedule.equipment_id||'');
 const ids=[...new Set<string>(schedules.flatMap(s=>(s.calendar_operations||[]).map((o:any)=>idFor(s,o))).filter(id=>/^[1-9]\d{0,17}$/.test(id)))];
 const workshops=await equipmentWorkshopStatus(ids);
 for(const schedule of schedules)for(const operation of schedule.calendar_operations||[]){
  const current=workshops.get(idFor(schedule,operation));
  operation.workshop=current?{id:String(current.id),name:current.workshop||'Oficina não informada'}:null;
 }
}
