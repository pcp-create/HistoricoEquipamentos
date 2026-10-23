import 'server-only';
import {database} from '../db';
export async function equipmentWorkshopStatus(ids:string[]){
 const db=database();if(!ids.length)return new Map<string,any>();
 if(!(await db.query("SELECT to_regclass('public.web_workshop_visits') IS NOT NULL available")).rows[0]?.available)return new Map<string,any>();
 const rows=(await db.query(`SELECT v.equipment_id::text,v.id,w.name workshop,v.entered_at FROM web_workshop_visits v LEFT JOIN web_workshops w ON w.id=v.workshop_id WHERE v.equipment_id=ANY($1::bigint[]) AND v.exited_at IS NULL AND v.reconciled_out_at IS NULL`,[ids])).rows;
 return new Map(rows.map(r=>[r.equipment_id,r]));
}
