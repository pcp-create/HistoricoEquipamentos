import 'server-only';
import {database} from '../db';
import {contactAccess} from './contacts';
import {AdminInputError} from '../admin-store';
export async function equipmentInactivations(db:any){
 const exists=(await db.query("SELECT to_regclass('public.web_visit_equipment_inactivations') IS NOT NULL AS available")).rows[0]?.available;
 return exists?(await db.query('SELECT customer_key,equipment_key,reason,actor,created_at FROM web_visit_equipment_inactivations')).rows:[];
}
export async function inactivateVisitEquipment(body:any,email:string){
 const customer=String(body.customer||''),equipment=String(body.equipment||'');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(!reason||reason.length>2000)throw new AdminInputError('Informe a justificativa da inativação (até 2.000 caracteres).');
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');await contactAccess(c,customer,email);
  let allowed=false;
  if(/^pending:[0-9a-f-]{36}$/i.test(equipment))allowed=(await c.query('SELECT 1 FROM web_visit_machine_registrations WHERE id=$1 AND customer_key=$2',[equipment.slice(8),customer])).rows.length>0;
  else if(/^\d+$/.test(equipment))allowed=(await c.query('SELECT 1 FROM web_effective_person_equipment WHERE customer_key=$1 AND equipment_id=$2 AND present',[customer,equipment])).rows.length>0;
  if(!allowed)throw new AdminInputError('Selecione um equipamento deste cliente.');
  const inserted=await c.query('INSERT INTO web_visit_equipment_inactivations(customer_key,equipment_key,reason,actor) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *',[customer,equipment,reason,email]);
  const row=inserted.rows[0]||(await c.query('SELECT * FROM web_visit_equipment_inactivations WHERE customer_key=$1 AND equipment_key=$2',[customer,equipment])).rows[0];
  if(inserted.rows.length)await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('visit_equipment_inactivated',$1,$1,$2)",[email,JSON.stringify(row)]);
  await c.query('COMMIT');return {inactivation:row};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
