import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {Forbidden} from '../auth';
import {CustomerEmailError} from './customer-email';
import {emailRecipients} from './email-recipients';
import {summaryReportFilename} from './report-filename';
export async function customerEmailContacts(scheduleId:string,actor:string,input?:any){
 if(!/^\d{1,18}$/.test(scheduleId||''))throw new CustomerEmailError('Programação inválida.');
 const c=await database().connect();
 try{
  await c.query(input?'BEGIN READ WRITE':'BEGIN READ ONLY');
  if(!(await c.query('SELECT 1 FROM web_user_access WHERE email=$1 AND enabled',[actor])).rows.length)throw new Forbidden();
  const order=(await c.query(`SELECT o.*,d.payload->>'email' directory_email FROM web_service_schedules s JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id LEFT JOIN m8_customer_directory d ON d.company_id=o.company_id AND d.person_id=o.cliente_id WHERE s.id=$1 AND s.active`,[scheduleId])).rows[0];
  if(!order)throw new CustomerEmailError('Cliente da programação indisponível.');
  const key=order.cliente_id?'m8:'+order.cliente_id:null;
  let saved;
  if(input){
   if(!key)throw new CustomerEmailError('Esta OS não possui um cliente vinculado para cadastrar contatos.');
   const name=typeof input.name==='string'?input.name.trim():'',phone=typeof input.phone==='string'?input.phone.trim():'',job=typeof input.job_title==='string'?input.job_title.trim():'';
   let email;try{const emails=emailRecipients(input.email);if(emails.length!==1)throw Error('Informe somente um e-mail por contato.');email=emails[0];}catch(e){throw new CustomerEmailError((e as Error).message);}
   if(!name||name.length>160||job.length>160||phone.length>40||(phone&&!/^[+()\d\s.-]+$/.test(phone)))throw new CustomerEmailError('Confira o nome, cargo e telefone do contato.');
   saved=(await c.query(`INSERT INTO web_customer_contacts(id,customer_key,name,phone,email,job_title,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(customer_key,name,phone) DO UPDATE SET email=EXCLUDED.email,job_title=EXCLUDED.job_title RETURNING id,name,phone,email,job_title`,[randomUUID(),key,name,phone,email,job,actor])).rows[0];
  }
  const contacts=key?(await c.query('SELECT id,name,phone,email,job_title FROM web_customer_contacts WHERE customer_key=$1 ORDER BY lower(name),id',[key])).rows:[];
  const operations=(await c.query('SELECT document FROM web_service_operations WHERE schedule_id=$1 ORDER BY position',[scheduleId])).rows;
  await c.query('COMMIT');
  return {contacts,saved,canCreate:!!key,defaultEmail:order.cliente_email||order.directory_email||order.payload?.clienteEmail||'',reportFilename:summaryReportFilename(order,operations,String(order.id_m8))};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
