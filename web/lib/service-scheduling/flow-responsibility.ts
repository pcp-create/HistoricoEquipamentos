import 'server-only';
import {database} from '../db';
import {Forbidden} from '../auth';
import {flowAreas} from './flow-responsibility-model';
export async function flowResponsibilities(){
 const db=database();
 const [statuses,areas,users]=await Promise.all([
  db.query("SELECT r.id::text,r.name,r.active,COALESCE(f.area,'Outro') area FROM service_order_registries r LEFT JOIN web_service_flow_owners f ON f.flow_status_id=r.id WHERE r.kind='flow-statuses' ORDER BY r.id"),
  db.query('SELECT area,recipient FROM web_service_flow_recipients ORDER BY area'),
  db.query('SELECT email,display_name FROM web_user_access WHERE enabled ORDER BY display_name,email'),
 ]);
 return {statuses:statuses.rows,areas:flowAreas.map(area=>({area,recipient:areas.rows.find(r=>r.area===area)?.recipient||''})),users:users.rows};
}
export async function flowOwnerRows(){
 try{return (await database().query('SELECT flow_status_id::text id,area FROM web_service_flow_owners')).rows;}
 catch(e){if((e as any).code==='42P01')return [];throw e;}
}
export async function saveFlowResponsibility(body:any,email:string){
 const db=database(),c=await db.connect();
 try{
  await c.query('BEGIN READ WRITE');
  if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[email])).rows.length)throw new Forbidden();
  if(body.action==='status'){
   if(!/^\d{1,10}$/.test(String(body.id))||!flowAreas.includes(body.area))throw Error('Selecione uma área responsável válida.');
   if(!(await c.query("SELECT 1 FROM service_order_registries WHERE kind='flow-statuses' AND id=$1",[body.id])).rows.length)throw Error('Status Fluxo não encontrado.');
   await c.query('INSERT INTO web_service_flow_owners(flow_status_id,area,updated_by) VALUES($1,$2,$3) ON CONFLICT(flow_status_id) DO UPDATE SET area=EXCLUDED.area,updated_by=EXCLUDED.updated_by,updated_at=now()',[body.id,body.area,email]);
  }else if(body.action==='recipient'){
   if(!flowAreas.includes(body.area)||typeof body.recipient!=='string')throw Error('Área ou responsável inválido.');
   if(body.recipient&&!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[body.recipient])).rows.length)throw Error('Selecione um usuário ativo.');
   await c.query('INSERT INTO web_service_flow_recipients(area,recipient,updated_by) VALUES($1,NULLIF($2,\'\'),$3) ON CONFLICT(area) DO UPDATE SET recipient=EXCLUDED.recipient,updated_by=EXCLUDED.updated_by,updated_at=now()',[body.area,body.recipient,email]);
  }else throw Error('Ação inválida.');
  await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('service_flow_responsibility',$1,$1,$2::jsonb)",[email,JSON.stringify(body)]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
