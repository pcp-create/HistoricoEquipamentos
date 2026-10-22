import "server-only";
import {lastManualUpdate,recordManualUpdate} from "./registry-manual-updates";
import {database} from "./db";
import {orderTypeRows} from "./order-type-model";
import {fetchOrderTypes} from "./m8-order-types";
export async function listOrderTypes() {
 const result=await database().query("SELECT id::text, name, active, customer_equipment_only, collected_at FROM public.m8_order_type_catalog ORDER BY m8_order_type_catalog.id");
 return {rows:result.rows,lastManualUpdate:await lastManualUpdate("order-types")};
}
let pending: Promise<number> | undefined;
export function refreshOrderTypes(manualUser?:string) {
 if(pending) return pending;
 pending=refresh(manualUser).finally(()=>{pending=undefined;});
 return pending;
}
async function refresh(manualUser?:string) {
 const rows=orderTypeRows(await fetchOrderTypes());
 if(!rows.length) throw new Error("Cadastro vazio; dados anteriores preservados");
 const c=await database().connect();
 try {
  await c.query("BEGIN READ WRITE");
  await c.query("SELECT pg_advisory_xact_lock(81018)");
  await c.query(`INSERT INTO public.m8_order_type_catalog(id,name,active,customer_equipment_only)
   SELECT id,name,active,customer_equipment_only FROM jsonb_to_recordset($1::jsonb) AS r(id bigint,name text,active boolean,customer_equipment_only boolean)
   ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,active=EXCLUDED.active,customer_equipment_only=EXCLUDED.customer_equipment_only,collected_at=now()`,[JSON.stringify(rows)]);
  if(manualUser)await recordManualUpdate(c,"order-types",manualUser);
  await c.query("COMMIT");
  return rows.length;
 } catch(e) {await c.query("ROLLBACK");throw e;} finally {c.release();}
}
