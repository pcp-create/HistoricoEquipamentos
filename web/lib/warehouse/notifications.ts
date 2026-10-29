import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {PUBLIC_SYSTEM_URL} from '../public-url';
import {resetWhatsAppPhone} from '../password-reset-notifications';
import {WarehouseError} from './store';
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function warehouseMaterialMessage(d:any){
 return `📦 *Material incluído na OS pelo almoxarifado*\n\n*OS:* ${d.orderNumber}\n*Cliente:* ${d.customer||'Não informado'}\n*Equipamento:* ${d.equipment||'Não informado'}\n*Produto adicionado:* ${d.productCode} · ${d.productName}\n*Quantidade:* ${Number(d.quantity).toLocaleString('pt-BR',{maximumFractionDigits:3})} ${d.unit||''}\n*Valor unitário:* ${money(Number(d.price))}\n*Valor total do produto:* ${money(Number(d.total))}\n*Responsável no almoxarifado:* ${d.actorName||d.actor}\n*Justificativa:* ${d.justification}\n\nConfira a OS: ${PUBLIC_SYSTEM_URL}/historico?view=orders&company=${d.company}&orderNumber=${encodeURIComponent(d.orderNumber)}`;
}
/** Called in the same transaction that records the confirmed ERP addition. */
export async function queueWarehouseMaterialNotification(c:any,additionId:string,actor:string,document:any){
 const employee=(await c.query("SELECT display_name,COALESCE(to_jsonb(u)->'managers','[]') managers FROM web_user_access u WHERE email=$1",[actor])).rows[0];
 const inserted=await c.query('INSERT INTO web_warehouse_notification_events(addition_id,actor,document) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING addition_id',[additionId,actor,JSON.stringify({...document,actor,actorName:employee?.display_name||actor})]);
 if(!inserted.rows.length)return;
 await expandWarehouseRecipients(c,additionId,Array.isArray(employee?.managers)?employee.managers:[]);
}
async function expandWarehouseRecipients(c:any,id:string,managers:string[]){
 if(!managers.length)return;
 const rows=(await c.query('SELECT email FROM web_user_access WHERE enabled AND email=ANY($1::text[])',[managers])).rows;
 if(!rows.length)return;
 for(const row of rows)await c.query('INSERT INTO web_warehouse_notifications(addition_id,recipient) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,row.email]);
 await c.query('UPDATE web_warehouse_notification_events SET expanded=true WHERE addition_id=$1',[id]);
}
export async function claimWarehouseNotifications(){
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');
  await c.query('SELECT pg_advisory_xact_lock(829203,0)');
  const waiting=(await c.query(`SELECT e.addition_id,COALESCE(to_jsonb(u)->'managers','[]') managers FROM web_warehouse_notification_events e JOIN web_warehouse_material_additions a ON a.id=e.addition_id AND a.state='complete' LEFT JOIN web_user_access u ON u.email=e.actor WHERE NOT e.expanded AND EXISTS(SELECT 1 FROM web_user_access manager WHERE manager.enabled AND COALESCE(to_jsonb(u)->'managers','[]'::jsonb) ? manager.email) ORDER BY e.created_at LIMIT 100 FOR UPDATE OF e SKIP LOCKED`)).rows;
  for(const event of waiting)await expandWarehouseRecipients(c,event.addition_id,Array.isArray(event.managers)?event.managers:[]);
  const rows=(await c.query(`SELECT n.*,e.document,u.phone current_phone,u.enabled FROM web_warehouse_notifications n JOIN web_warehouse_notification_events e USING(addition_id) JOIN web_warehouse_material_additions a ON a.id=n.addition_id AND a.state='complete' LEFT JOIN web_user_access u ON u.email=n.recipient WHERE n.state='pending' AND n.attempts=0 AND u.enabled AND NULLIF(trim(u.phone),'') IS NOT NULL ORDER BY n.id LIMIT 20 FOR UPDATE OF n SKIP LOCKED`)).rows;
  const result=[];
  for(const row of rows){
   // Missing configuration remains pending so adding a phone later can deliver the notice.
   const phone=resetWhatsAppPhone(row.current_phone);if(!row.enabled||!phone)continue;
   const token=randomUUID();await c.query('UPDATE web_warehouse_notifications SET attempts=1,lease_token=$2,phone=$3 WHERE id=$1',[row.id,token,phone]);
   result.push({id:'warehouse:'+row.id,token,number:phone,text:warehouseMaterialMessage(row.document)});
  }
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function acknowledgeWarehouseNotification(id:unknown,token:unknown){
 if(typeof id!=='string'||!/^\d+$/.test(id)||typeof token!=='string'||!/^[0-9a-f-]{36}$/i.test(token))throw new WarehouseError('Confirmação do aviso inválida.');
 const c=await database().connect();
 try{await c.query('BEGIN READ WRITE');const r=await c.query("UPDATE web_warehouse_notifications SET state='sent',sent_at=COALESCE(sent_at,now()) WHERE id=$1 AND lease_token=$2 AND state IN('pending','sent') RETURNING id",[id,token]);if(!r.rowCount)throw new WarehouseError('Aviso não corresponde à entrega reclamada.');await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
