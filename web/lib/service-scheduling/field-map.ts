import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import { locationOf } from "./field-model";
import { scheduleMapData } from "./map-store";
import { localityText, positionLabel } from "./map-model";
import { fieldOperationOverdue } from "./field-overdue";
export const technicianSql = "lower(trim(job_title)) IN ('técnico','tecnico')";
export async function mapAccess(email: string, db = database()) {
  const u = (await db.query(`SELECT role,${technicianSql} technician FROM web_user_access WHERE email=$1 AND enabled`, [email])).rows[0];
  if (!u || (u.role !== 'admin' && !u.technician)) throw new Forbidden();
  return u;
}
export async function saveFieldLocation(email: string, raw: unknown) {
  const db = database();
  const u = await mapAccess(email, db);
  if (!u.technician) throw new Forbidden();
  const p = locationOf(raw);
  const c = await db.connect();
  try {
    await c.query('BEGIN READ WRITE');
    await c.query(`INSERT INTO web_field_locations(actor,latitude,longitude,accuracy,located_at) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(actor) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,located_at=excluded.located_at,updated_at=now()
      WHERE excluded.located_at>web_field_locations.located_at`, [email,p.latitude,p.longitude,p.accuracy,p.at]);
    await c.query('COMMIT');
  } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
export async function fieldMapData(email: string) {
  const db=database(); const access=await mapAccess(email,db);
  const technicians=(await db.query(`SELECT u.email id,u.display_name name,EXISTS(SELECT 1 FROM web_user_photos photo WHERE photo.email=u.email) has_photo,u.phone,u.job_title,u.department,u.last_seen_at,(u.last_seen_at>now()-interval '15 minutes' AND (u.last_logout_at IS NULL OR u.last_seen_at>u.last_logout_at)) IS TRUE online,p.latitude,p.longitude,p.accuracy,p.located_at,p.source
    FROM web_user_access u LEFT JOIN LATERAL (
      SELECT * FROM (
        SELECT latitude,longitude,accuracy,located_at,'Acesso ao portal' source FROM web_field_locations WHERE actor=u.email
        UNION ALL SELECT latitude,longitude,accuracy,located_at,'Apontamento' source FROM web_field_events WHERE actor=u.email
      ) positions WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY located_at DESC LIMIT 1
    ) p ON true WHERE u.enabled AND ${technicianSql} ORDER BY u.display_name,u.email`)).rows;
  const pending=(await db.query(`SELECT u.email technician,s.id::text id,coalesce(o.numero_sequencia,o.id_m8)::text number,o.cliente_nome customer,min(p.document->>'date') date
    FROM web_user_access u JOIN web_service_operations p ON (p.document->>'responsible'=u.email OR p.document->'support' ? u.email)
    JOIN web_service_schedules s ON s.id=p.schedule_id JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
    WHERE u.enabled AND ${technicianSql} AND s.active AND p.sent_at IS NOT NULL AND p.status NOT IN ('awaiting_review','reviewed','completed')
    GROUP BY u.email,s.id,o.numero_sequencia,o.id_m8,o.cliente_nome ORDER BY min(p.document->>'date') NULLS LAST,s.id`)).rows;
  for(const technician of technicians) technician.pendingOrders=pending.filter(row=>row.technician===technician.id).map(({technician:_,...order})=>order);
  const rows=(await db.query(`SELECT s.id::text schedule_id,p.status,p.document->>'date' date,o.cliente_id::text customer_id,coalesce(o.numero_sequencia,o.id_m8)::text number,o.cliente_nome customer
    FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id
    JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
    WHERE s.active AND p.sent_at IS NOT NULL AND (p.document->>'responsible'=$1 OR p.document->'support' ? $1)`,[email])).rows;
  const map=await scheduleMapData(email,db,true);
  const orders=map.schedules.map((s:any)=>{
    const operations=rows.filter(r=>r.schedule_id===s.id);
    const a=s.localities.find((a:any)=>a.address_id===s.selectedAddressId);
    const done=operations.length>0 && operations.every(r=>['awaiting_review','reviewed','completed'].includes(r.status));
    const status=done?'done':operations.some(r=>fieldOperationOverdue(r.date,r.status,Date.now()))?'overdue':operations.some(r=>r.status==='executing')?'executing':'planned';
    return {id:s.id,number:operations[0]?.number || s.id,customerId:operations[0]?.customer_id,customer:operations[0]?.customer || 'Cliente não informado',name:`OS ${operations[0]?.number || s.id} · ${operations[0]?.customer || ''}`,latitude:a?.latitude,longitude:a?.longitude,address:a?localityText(a):s.reason,precision:a?positionLabel(a.precision):'',status};
  });
  return {technicians,orders:orders.filter((order:any)=>order.status!=='done'),canShare:access.technician};
}
