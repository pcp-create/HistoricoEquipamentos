import {synchronizeEquipmentActivity} from '../equipment/relationship-integration';
import 'server-only';
import {database} from '../db';
import {contactAccess} from './contacts';
import {AdminInputError} from '../admin-store';
export async function equipmentInactivations(db:any){
 const exists=(await db.query("SELECT to_regclass('public.web_visit_equipment_inactivations') IS NOT NULL AS available")).rows[0]?.available;
 return exists?(await db.query('SELECT customer_key,equipment_key,reason,actor,created_at,integration_status FROM web_visit_equipment_inactivations WHERE reactivated_at IS NULL AND integration_status<>\'superseded\'')).rows:[];
}
export async function inactivateVisitEquipment(body:any,email:string){
 const customer=String(body.customer||''),equipment=String(body.equipment||'');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 if(!reason||reason.length>2000)throw new AdminInputError('Informe a justificativa da inativação (até 2.000 caracteres).');
 let row:any;const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');await contactAccess(c,customer,email);
  let allowed=false;
  if(/^pending:[0-9a-f-]{36}$/i.test(equipment))allowed=(await c.query('SELECT 1 FROM web_visit_machine_registrations WHERE id=$1 AND customer_key=$2',[equipment.slice(8),customer])).rows.length>0;
  else if(/^\d+$/.test(equipment))allowed=(await c.query('SELECT 1 FROM web_effective_person_equipment WHERE customer_key=$1 AND equipment_id=$2 AND present',[customer,equipment])).rows.length>0;
  if(!allowed)throw new AdminInputError('Selecione um equipamento deste cliente.');
  const inserted=await c.query(`INSERT INTO web_visit_equipment_inactivations(customer_key,equipment_key,reason,actor) VALUES($1,$2,$3,$4) ON CONFLICT(customer_key,equipment_key) DO UPDATE SET reason=EXCLUDED.reason,actor=EXCLUDED.actor,created_at=now(),reactivated_at=NULL,integration_status='pending',integration_error=NULL,confirmed_at=NULL WHERE web_visit_equipment_inactivations.reactivated_at IS NOT NULL OR web_visit_equipment_inactivations.integration_status='superseded' RETURNING *`,[customer,equipment,reason,email]);
  row=inserted.rows[0]||(await c.query('SELECT * FROM web_visit_equipment_inactivations WHERE customer_key=$1 AND equipment_key=$2',[customer,equipment])).rows[0];
  if(inserted.rows.length)await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('visit_equipment_inactivated',$1,$1,$2)",[email,JSON.stringify(row)]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  let integration:any={integrationPending:true};if(/^m8:[0-9]+$/.test(customer)&&/^\d+$/.test(equipment)){try{integration=await synchronizeEquipmentActivity(database(),equipment,customer);}catch{integration={integrationPending:true};}}
  return {inactivation:row,...integration};

}
