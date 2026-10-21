import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from './db';
import {PUBLIC_SYSTEM_URL} from './public-url';
import {INITIAL_PASSWORD} from './password-policy';
import {TaskInputError,TaskConflict} from './tasks/store';
export function resetWhatsAppPhone(value:unknown){
 if(typeof value!=='string')return null;
 let number=value.replace(/\D/g,'');
 if(number.length===10||number.length===11)number='55'+number;
 return /^[1-9]\d{10,14}$/.test(number)?number:null;
}
export function passwordResetMessage(user:{display_name?:string;email:string}){
 return `*Assistente RJ (DSU)*\n\nOlá, ${user.display_name||user.email}! Sua senha de acesso foi resetada pelo administrador.\n\n*Acesso:* ${PUBLIC_SYSTEM_URL}/login\n*Usuário:* ${user.email}\n*Senha padrão:* ${INITIAL_PASSWORD}\n\nNo próximo acesso, você deverá criar uma nova senha diferente da padrão para continuar no sistema.`;
}
export async function claimPasswordResetNotifications(){
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');
  await c.query('SELECT pg_advisory_xact_lock(81020,1)');
  const rows=(await c.query(`SELECT n.*,u.display_name,u.enabled,u.phone AS current_phone,u.user_id AS current_user_id FROM web_password_reset_notifications n LEFT JOIN web_user_access u ON u.email=n.email WHERE n.state='pending' AND n.attempts=0 ORDER BY n.id LIMIT 20 FOR UPDATE OF n SKIP LOCKED`)).rows;
  const notifications=[];
  for(const n of rows){
   if(!n.enabled||n.user_id!==n.current_user_id||n.phone!==resetWhatsAppPhone(n.current_phone)){
    await c.query("UPDATE web_password_reset_notifications SET state='skipped' WHERE id=$1",[n.id]);continue;
   }
   const token=randomUUID();
   await c.query('UPDATE web_password_reset_notifications SET attempts=1,lease_token=$2 WHERE id=$1',[n.id,token]);
   notifications.push({id:`password-reset:${n.id}`,token,number:n.phone,text:passwordResetMessage(n)});
  }
  await c.query('COMMIT');return notifications;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function acknowledgePasswordReset(id:unknown,token:unknown){
 if(typeof id!=='string'||!/^\d+$/.test(id)||typeof token!=='string'||!/^[0-9a-f-]{36}$/i.test(token))throw new TaskInputError('Confirmação inválida.');
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');
  const result=await c.query("UPDATE web_password_reset_notifications SET state='sent',sent_at=coalesce(sent_at,now()) WHERE id=$1 AND lease_token=$2 AND state IN ('pending','sent') RETURNING id",[id,token]);
  if(!result.rowCount)throw new TaskConflict('Aviso de senha não corresponde à entrega pendente.');
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
