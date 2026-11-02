import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {currentProducts} from '../product-current';
import {withPurchaseBalances} from './purchase-balances';
import {isNotApproved} from '../material-approval';
import {combineOrderItems} from './linked-items';
import {sameUnit} from '../product-values';
import {effectiveOperationStatus} from './model';
import {scheduleStatus,scheduleStatusNames} from './model';
import {summarizeParts,type PartsReportRow} from './parts-report-model';
const eligibleOrder = (alias:string) => `lower(trim(COALESCE(${alias}.status,''))) NOT IN ('processado','processada','cancelado','cancelada','excluido','excluida','excluído','excluída')
 AND lower(trim(COALESCE(${alias}.payload->>'estaExcluido','false'))) NOT IN ('true','1','sim')`;
export async function partsReport(email:string){
 const db=database();
 const access=(await db.query('SELECT enabled FROM web_user_access WHERE email=$1',[email.toLowerCase()])).rows[0];
 if(!access?.enabled)throw new Forbidden();
 const schedules=(await db.query(`SELECT s.id::text,s.company_id,s.order_id::text,o.numero_sequencia,o.cliente_nome,o.equipamento,o.status,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('status',p.status,'document',p.document)) FROM web_service_operations p WHERE p.schedule_id=s.id),'[]'::jsonb) operations
   FROM web_service_schedules s LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id WHERE s.active AND ${eligibleOrder("o")} ORDER BY s.company_id,s.order_id`)).rows;
 const keys=schedules.map(s=>({schedule_id:s.id,company_id:s.company_id,order_id:s.order_id}));
 const sources=(await db.query(`WITH requested AS(SELECT * FROM jsonb_to_recordset($1::jsonb) k(schedule_id bigint,company_id int,order_id bigint)),
   sources AS(SELECT k.*,false linked FROM requested k UNION ALL SELECT k.schedule_id,l.linked_company_id,l.linked_order_id,true FROM requested k JOIN web_order_links l USING(company_id,order_id) JOIN m8_ordens_servico linked ON linked.company_id=l.linked_company_id AND linked.id_m8=l.linked_order_id WHERE ${eligibleOrder("linked")})
   SELECT s.schedule_id::text,s.company_id,s.order_id::text,s.linked,q.last_detail_at,
     COALESCE(jsonb_agg((to_jsonb(p)-'payload')||jsonb_build_object('withdrawn',COALESCE(u.withdrawn,0),'used',COALESCE(u.used,0))) FILTER(WHERE p.id_m8 IS NOT NULL),'[]'::jsonb) materials
   FROM sources s LEFT JOIN integracao_m8_os_sync q ON q.company_id=s.company_id AND q.ordem_servico_id=s.order_id
   LEFT JOIN m8_os_produtos p ON p.company_id=s.company_id AND p.ordem_servico_id=s.order_id
   LEFT JOIN web_service_item_usage u ON u.schedule_id=s.schedule_id AND u.item_company=p.company_id AND u.item_order=p.ordem_servico_id AND u.item_id=p.id_m8
   GROUP BY s.schedule_id,s.company_id,s.order_id,s.linked,q.last_detail_at`,[JSON.stringify(keys)])).rows;
 const all=sources.flatMap(s=>s.materials.map((m:any)=>({...m,item_company:s.company_id})));
 const [current,enriched]=await Promise.all([currentProducts(all.map(m=>({company_id:m.item_company,product_id:m.produto_id}))),withPurchaseBalances(all)]);
 const productKeys=[...new Map(all.filter(m=>m.produto_id).map(m=>[`${m.item_company}:${m.produto_id}`,{company_id:m.item_company,product_id:m.produto_id}])).values()];
 const purchases=(await db.query(`SELECT i.company_id,i.product_id::text,i.order_id::text id,COALESCE(o.payload->>'numeroSequencia',o.id::text) number,o.supplier,
   COALESCE(NULLIF(trim(regexp_replace(i.unit,'^[0-9]+\\s*-\\s*','')),''),'Unidade não informada') unit,
   sum(i.balance)::float8 quantity,left(COALESCE(NULLIF(i.payload->>'dataPrazoReprogramado',''),NULLIF(i.payload->>'dataPrazoEntrega',''),NULLIF(o.payload->>'dataPrazoEntrega','')),10) date,o.status status
   FROM jsonb_to_recordset($1::jsonb) k(company_id int,product_id bigint)
   JOIN m8_purchase_items i USING(company_id,product_id) JOIN m8_purchase_orders o ON o.company_id=i.company_id AND o.id=i.order_id
   WHERE o.present AND o.eligible AND i.eligible AND i.balance>0 GROUP BY i.company_id,i.product_id,i.order_id,o.id,o.payload,o.supplier,o.status,unit,date`,[JSON.stringify(productKeys)])).rows;
 const rows:PartsReportRow[]=[];
 const coverage:any[]=[];
 for(const s of schedules){
  const source=sources.filter(r=>r.schedule_id===s.id),main=source.find(r=>!r.linked);
  const linked=source.find(r=>r.linked);
  const combined=combineOrderItems(main,linked,'materials',s.company_id,s.order_id,linked?.company_id,linked?.order_id);
  const counts:Record<string,number>={};for(const op of s.operations){const status=effectiveOperationStatus(op.status,op.document);counts[status]=(counts[status]||0)+1;}
  const programming=scheduleStatusNames[scheduleStatus(counts)]||'Sem operações';
  const closed=scheduleStatus(counts)==='completed'||['processado','cancelado','cancelada'].includes(String(s.status||'').toLowerCase());
  coverage.push({scheduleId:s.id,order:String(s.numero_sequencia||s.order_id),company:s.company_id,status:s.status||'Não informado',programming,customer:s.cliente_nome||'Não informado',materials:source.reduce((n,r)=>n+r.materials.length,0),complete:source.length>0&&source.every(r=>!!r.last_detail_at)});
  for(const origin of source)for(const m of origin.materials){
   const duplicate=origin.linked&&main?.materials.some((p:any)=>String(p.produto_id)===String(m.produto_id)&&p.esta_excluido!==true&&!isNotApproved(p.aprovado));
   const excluded=closed?'OS encerrada/cancelada':m.esta_excluido?'Item excluído':isNotApproved(m.aprovado)?'Item não aprovado':duplicate?'Espelhado na OS principal':'';
   const c=current.get(`${origin.company_id}:${m.produto_id}`),p=enriched.find(e=>e.item_company===origin.company_id&&String(e.id_m8)===String(m.id_m8));
   const qty=m.quantidade==null?null:Number(m.quantidade),withdrawn=Number(m.withdrawn||0);
   rows.push({scheduleId:s.id,key:`${s.id}:${origin.company_id}:${m.id_m8}`,company:origin.company_id,order:String(s.numero_sequencia||s.order_id),customer:s.cliente_nome||'Não informado',equipment:s.equipamento||'Não informado',orderStatus:s.status||'Não informado',programmingStatus:programming,sourceOrder:origin.order_id,product:String(m.produto_id||''),name:m.produto_nome||'Produto não informado',unit:m.unidade_nome||'Não informada',quantity:qty,withdrawn,used:Number(m.used||0),needed:Math.max(0,(qty||0)-withdrawn),eligible:!excluded,exclusion:excluded,collectedAt:origin.last_detail_at?new Date(origin.last_detail_at).toISOString():null,stock:c?.stock==null?null:Number(c.stock),available:c?.available==null?null:Number(c.available),stockAt:c?.available_at?new Date(c.available_at).toISOString():null,purchases:purchases.filter(v=>v.company_id===origin.company_id&&v.product_id===String(m.produto_id)),purchasesComplete:p?.purchases.complete||false,purchasesAt:p?.purchases.collectedAt||null,inconsistent:!!combined.find((i:any)=>String(i.item_company)===String(origin.company_id)&&String(i.id_m8)===String(m.id_m8))?.quantity_inconsistency||qty==null||!Number.isFinite(qty)||qty<0||withdrawn>(qty||0)||!sameUnit(m.unidade_nome,c?.unit)});
  }
 }
 const generatedAt=new Date().toISOString(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 return {generatedAt,scope:'OSs ativas na programação, desconsiderando processadas, canceladas e excluídas.',rows,groups:summarizeParts(rows,today),coverage};
}
export type PartsReport=Awaited<ReturnType<typeof partsReport>>;
