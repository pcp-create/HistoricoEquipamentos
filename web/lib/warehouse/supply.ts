import "server-only";
import {database} from "../db";
import {withPurchaseBalances} from "../service-scheduling/purchase-balances";
/** Keep quantities and purchase units scoped to the item's company. Unknown is never zero. */
export async function withWarehouseSupply(materials:any[],db:any=database()) {
 if(!materials.length)return materials;
 const keys=[...new Map(materials.filter(m=>m.produto_id).map(m=>[`${m.item_company}:${m.produto_id}`,{company_id:Number(m.item_company),product_id:String(m.produto_id)}])).values()];
 const available=(await db.query("SELECT to_regclass('public.m8_product_current') IS NOT NULL available")).rows[0]?.available;
 const stock=available?(await db.query(`SELECT c.company_id,c.product_id::text,c.stock,c.available,c.unit,c.stock_at,c.available_at FROM m8_product_current c JOIN jsonb_to_recordset($1::jsonb) k(company_id int,product_id bigint) USING(company_id,product_id)`,[JSON.stringify(keys)])).rows:[];
 const purchases=await withPurchaseBalances(materials,db);
 return purchases.map(m=>({...m,supply:stock.find((s:any)=>String(s.company_id)===String(m.item_company)&&String(s.product_id)===String(m.produto_id))||null}));
}
