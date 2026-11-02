import 'server-only';
import {database} from '../db';
import {currentProducts} from '../product-current';
import {combineOrderItems} from './linked-items';
import {withPurchaseBalances} from './purchase-balances';
import {plannedDate} from './planned-date';

export async function attachPlannedDates(schedules:any[],settings:any){
 if(!schedules.length)return;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const calendar=settings.calendars?.find((c:any)=>c.id==='standard');
 schedules=schedules.filter(s=>{
   const result=plannedDate({schedule:s,calendar,today,materials:[],external:[],complete:false});
   if(result.source==='scheduled'||result.source==='finished'){s.planned_date=result;return false;}
   return true;
 });
 if(!schedules.length)return;
 const db=database();
 const keys=schedules.map(s=>({schedule_id:String(s.id),company_id:s.company_id,order_id:String(s.order_id)}));
 const [sources,external]=await Promise.all([
  db.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) k(schedule_id bigint,company_id int,order_id bigint)),
    sources AS (SELECT k.*,false linked FROM requested k UNION ALL
      SELECT k.schedule_id,l.linked_company_id,l.linked_order_id,true FROM requested k JOIN web_order_links l USING(company_id,order_id))
    SELECT s.schedule_id::text,s.company_id,s.order_id::text,s.linked,q.last_detail_at,
      COALESCE(jsonb_agg((to_jsonb(p)-'payload')||jsonb_build_object('withdrawn',COALESCE(u.withdrawn,0))) FILTER(WHERE p.id_m8 IS NOT NULL),'[]'::jsonb) materials
    FROM sources s LEFT JOIN integracao_m8_os_sync q ON q.company_id=s.company_id AND q.ordem_servico_id=s.order_id
    LEFT JOIN m8_os_produtos p ON p.company_id=s.company_id AND p.ordem_servico_id=s.order_id
    LEFT JOIN web_service_item_usage u ON u.schedule_id=s.schedule_id AND u.item_company=p.company_id AND u.item_order=p.ordem_servico_id AND u.item_id=p.id_m8
    GROUP BY s.schedule_id,s.company_id,s.order_id,s.linked,q.last_detail_at`,[JSON.stringify(keys)]),
  db.query(`SELECT DISTINCT k.schedule_id::text,e.id,e.component,e.expected_at::text
    FROM jsonb_to_recordset($1::jsonb) k(schedule_id bigint,company_id int,order_id bigint)
    JOIN m8_ordens_servico o ON o.company_id=k.company_id AND o.id_m8=k.order_id
    JOIN web_workshop_visits v ON v.exited_at IS NULL AND v.reconciled_out_at IS NULL AND (
      v.equipment_id=o.produto_equipamento_id OR EXISTS(SELECT 1 FROM m8_order_equipment_links l
        WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.equipment_id=v.equipment_id AND NOT l.stale))
    JOIN web_workshop_external e ON e.visit_id=v.id AND e.returned_at IS NULL AND e.reconciled_out_at IS NULL`,[JSON.stringify(keys)]),
 ]);
 const all=schedules.flatMap(s=>{
  const rows=sources.rows.filter(r=>String(r.schedule_id)===String(s.id));
  const main=rows.find(r=>!r.linked),linked=rows.find(r=>r.linked);
  return combineOrderItems(main,linked,'materials',s.company_id,s.order_id,linked?.company_id,linked?.order_id).map(m=>({...m,schedule_id:String(s.id)}));
 });
 const [current,materials]=await Promise.all([currentProducts(all.map(m=>({company_id:m.item_company,product_id:m.produto_id}))),withPurchaseBalances(all)]);
 for(const s of schedules){
  const rows=sources.rows.filter(r=>String(r.schedule_id)===String(s.id));
  s.planned_date=plannedDate({schedule:s,calendar,today,
    complete:rows.length>0&&rows.every(r=>!!r.last_detail_at),
    materials:materials.filter(m=>m.schedule_id===String(s.id)).map(m=>({...m,current:current.get(`${m.item_company}:${m.produto_id}`)})),
    external:external.rows.filter(e=>String(e.schedule_id)===String(s.id))});
 }
}
