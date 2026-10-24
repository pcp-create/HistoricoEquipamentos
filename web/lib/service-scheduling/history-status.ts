import "server-only";
import {database} from "../db";
import {effectiveOperationStatus,scheduleStatus,scheduleStatusNames} from "./model";
import {displayedScheduleStatus} from "./display-status";
export async function historyScheduleStatuses(rows:{company_id:string|number;id:string|number;status:string|null}[]) {
  const keys=[...new Map(rows.map(row=>[`${row.company_id}:${row.id}`,{company_id:row.company_id,order_id:row.id}])).values()];
  if(!keys.length)return new Map<string,{status:string;label:string;id?:string}>();
  const operations=(await database().query(`SELECT s.id::text schedule_id,s.company_id::text,s.order_id::text,p.id,p.status,
    p.document->>'date' AS date,p.document->>'time' AS time,p.document->>'responsible' AS responsible
    FROM web_service_schedules s JOIN jsonb_to_recordset($1::jsonb) AS k(company_id bigint,order_id bigint)
      ON k.company_id=s.company_id AND k.order_id=s.order_id
    LEFT JOIN web_service_operations p ON p.schedule_id=s.id WHERE s.active`,[JSON.stringify(keys)])).rows;
  const ids=new Map<string,string>();
  const grouped=new Map<string,Record<string,number>>();
  for(const op of operations){const key=`${op.company_id}:${op.order_id}`,counts=grouped.get(key)||{};
    if(op.id){const status=effectiveOperationStatus(op.status,op);counts[status]=(counts[status]||0)+1;}grouped.set(key,counts);ids.set(key,op.schedule_id);
  }
  return new Map(rows.map(row=>{const key=`${row.company_id}:${row.id}`,counts=grouped.get(key);
    const status=counts?displayedScheduleStatus({order_status:row.status,programming_status:scheduleStatus(counts)}):'none';
    return [key,{status,id:ids.get(key),label:status==='none'?'Sem programação':scheduleStatusNames[status]||status}];
  }));
}
