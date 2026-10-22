import "server-only";
import {database} from "../db";
export type PurchaseBalance = {
  imported: boolean; complete: boolean; collectedAt: string | null;
  groups: {unit: string; quantity: string; orders: string[]; deliveryDates: (string | null)[]}[];
};
/** Company and product form the key: never mix stocks or purchase units across companies. */
export async function withPurchaseBalances(materials: any[], db: Pick<ReturnType<typeof database>,"query"> = database()) {
  if (!materials.length) return materials;
  const available=(await db.query("SELECT to_regclass('public.m8_purchase_sync') IS NOT NULL AS available")).rows[0]?.available;
  if (!available) return materials.map(m=>({...m,purchases:{imported:false,complete:false,collectedAt:null,groups:[]}}));
  const keys=[...new Map(materials.filter(m=>m.produto_id!=null).map(m=>[`${m.item_company}:${m.produto_id}`,{company_id:Number(m.item_company),product_id:String(m.produto_id)}])).values()];
  const companies=[...new Set(materials.map(m=>Number(m.item_company)))];
  const progress=(await db.query(`SELECT s.company_id,s.headers_at,
    count(o.id) FILTER(WHERE o.eligible AND o.present AND (o.pending OR o.detail_at IS NULL OR o.failures>0))::int AS pending,
    min(o.detail_at) FILTER(WHERE o.eligible AND o.present) AS detail_at
    FROM public.m8_purchase_sync s LEFT JOIN public.m8_purchase_orders o USING(company_id)
    WHERE s.company_id=ANY($1::int[]) GROUP BY s.company_id,s.headers_at`,[companies])).rows;
  const rows=(await db.query(`WITH requested AS (SELECT DISTINCT company_id,product_id FROM jsonb_to_recordset($1::jsonb) AS k(company_id integer,product_id bigint))
    SELECT i.company_id,i.product_id::text,
      COALESCE(NULLIF(trim(regexp_replace(i.unit,'^[0-9]+\\s*-\\s*','')),''),'Unidade não informada') AS unit,
      sum(i.balance)::text AS quantity,array_agg(DISTINCT i.order_id::text ORDER BY i.order_id::text) AS orders,
      array_agg(DISTINCT left(COALESCE(NULLIF(i.payload->>'dataPrazoReprogramado',''),NULLIF(i.payload->>'dataPrazoEntrega',''),NULLIF(o.payload->>'dataPrazoEntrega','')),10)) AS delivery_dates
    FROM requested k JOIN public.m8_purchase_items i USING(company_id,product_id)
    JOIN public.m8_purchase_orders o ON o.company_id=i.company_id AND o.id=i.order_id
    WHERE o.present AND o.eligible AND i.eligible AND i.balance>0
    GROUP BY i.company_id,i.product_id,COALESCE(NULLIF(trim(regexp_replace(i.unit,'^[0-9]+\\s*-\\s*','')),''),'Unidade não informada')
    ORDER BY i.company_id,i.product_id,unit`,[JSON.stringify(keys)])).rows;
  return materials.map(m=>{
    const status=progress.find(p=>String(p.company_id)===String(m.item_company));
    const purchases:PurchaseBalance={imported:!!status,complete:!!status && status.pending===0,
      collectedAt:status ? new Date(Math.min(new Date(status.headers_at).getTime(),new Date(status.detail_at || status.headers_at).getTime())).toISOString():null,
      groups:rows.filter(r=>String(r.company_id)===String(m.item_company) && String(r.product_id)===String(m.produto_id)).map(r=>({unit:r.unit,quantity:r.quantity,orders:r.orders,deliveryDates:r.delivery_dates}))};
    return {...m,purchases};
  });
}
