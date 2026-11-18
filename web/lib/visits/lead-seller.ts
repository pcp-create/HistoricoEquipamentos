import 'server-only';
import {database} from '../db';
import {AdminInputError} from '../admin-store';
import {Forbidden} from '../auth';
import {canManageVisits} from '../access-roles';
import {visitIdentity} from './store';
const leadId=(key:unknown)=>{
 if(typeof key!=='string'||!/^lead:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))throw new AdminInputError('Lead inválido.');
 return key.slice(5);
};
export async function leadSellerOptions(key:unknown,email:string){
 const db=database(),actor=await visitIdentity(db,email);
 const lead=(await db.query('SELECT owner FROM web_sales_leads WHERE id=$1',[leadId(key)])).rows[0];
 if(!lead)throw new AdminInputError('Lead não encontrado.');
 if(lead.owner!==email&&!canManageVisits(actor.role))throw new Forbidden();
 const sellers=(await db.query("SELECT email AS id,COALESCE(NULLIF(display_name,''),email) AS name FROM web_user_access WHERE enabled AND lower(trim(job_title)) IN ('vendedor','vendedora') ORDER BY display_name,email")).rows;
 return {owner:lead.owner,sellers};
}
export async function changeLeadSeller(body:any,email:string){
 const id=leadId(body?.customer_key);
 if(typeof body.seller!=='string'||typeof body.expectedOwner!=='string')throw new AdminInputError('Selecione o vendedor responsável.');
 const seller=body.seller.trim().toLowerCase();
 const c=await database().connect();
 try{
  await c.query('BEGIN READ WRITE');
  const actor=await visitIdentity(c,email);
  const lead=(await c.query('SELECT * FROM web_sales_leads WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!lead)throw new AdminInputError('Lead não encontrado.');
  if(lead.owner!==email&&!canManageVisits(actor.role))throw new Forbidden();
  if(lead.owner!==body.expectedOwner)throw new AdminInputError('O responsável pelo lead foi alterado. Atualize os dados antes de salvar.');
  const target=(await c.query("SELECT email FROM web_user_access WHERE email=$1 AND enabled AND lower(trim(job_title)) IN ('vendedor','vendedora') FOR SHARE",[seller])).rows[0];
  if(!target)throw new AdminInputError('Selecione um vendedor ativo.');
  if(lead.owner!==seller){
   await c.query('UPDATE web_sales_leads SET owner=$2 WHERE id=$1',[id,seller]);
   await c.query("INSERT INTO web_access_events(event,email,actor,details) VALUES('sales_lead_seller_changed',$1,$1,$2)",[email,JSON.stringify({customer_key:body.customer_key,name:lead.name,before:lead.owner,after:seller})]);
  }
  // Visits and their tasks keep the original seller and history.
  await c.query('COMMIT');return {saved:true};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
