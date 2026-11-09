import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {customerEmailContacts} from '../lib/service-scheduling/customer-email-contacts';
test('email contacts persist by customer across orders and prefill the ERP email',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool,query=db.query.bind(db);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE TABLE web_user_access(email text,enabled boolean);INSERT INTO web_user_access VALUES('planner',true),('disabled',false);
  CREATE TABLE web_service_schedules(id bigint,company_id bigint,order_id bigint,active boolean);
  INSERT INTO web_service_schedules VALUES(1,1,100,true),(2,1,101,true),(3,1,102,true);
  CREATE TABLE m8_ordens_servico(company_id bigint,id_m8 bigint,cliente_id bigint,numero_sequencia bigint,cliente_nome text,payload jsonb);
  INSERT INTO m8_ordens_servico VALUES(1,100,50,123,'Cliente A','{}'),(1,101,50,124,'Cliente A','{}'),(1,102,60,125,'Cliente B','{}');
  CREATE TABLE m8_customer_directory(company_id bigint,person_id bigint,payload jsonb);
  INSERT INTO m8_customer_directory VALUES(1,50,'{"email":"erp@example.com"}');
  CREATE TABLE web_service_operations(schedule_id bigint,position int,document jsonb);
  INSERT INTO web_service_operations VALUES(1,1,'{"serviceType":"Corretiva","equipment":{"model":"GA22","serial":"ABC"}}');
  CREATE TABLE web_customer_contacts(id uuid,customer_key text,name text,phone text,created_by text,UNIQUE(customer_key,name,phone));`);
  await db.exec(readFileSync('sql/102_customer_contact_email.sql','utf8'));
  const initial=await customerEmailContacts('1','planner');assert.equal(initial.defaultEmail,'erp@example.com');assert.match(initial.reportFilename,/OS 123 - Cliente A C GA22 Série ABC.pdf/);
  const input={name:'Ana',email:'ana@example.com',job_title:'Compras',phone:'47999999999'};
  await customerEmailContacts('1','planner',input);
  await customerEmailContacts('1','planner',{...input,job_title:'Gerência'});
  const other=await customerEmailContacts('2','planner');assert.equal(other.contacts.length,1);assert.equal(other.contacts[0].job_title,'Gerência');assert.equal(other.contacts[0].email,input.email);
  assert.equal((await customerEmailContacts('3','planner')).contacts.length,0);
  await assert.rejects(customerEmailContacts('1','disabled',input));
  await assert.rejects(customerEmailContacts('1','planner',{...input,email:'a@example.com,b@example.com'}),/somente um/);
 }finally{g.historyPool=old;await db.close();}
});
