import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {crmDirectory} from '../lib/crm/directory';
test('CRM lists deduplicated customers and local contacts while preserving lead access scope',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;g.historyPool={query:db.query.bind(db)};
 try{
 await db.exec(`CREATE TABLE web_user_access(email text,enabled boolean,role text,display_name text);INSERT INTO web_user_access VALUES('seller',true,'user','Vendedor'),('other',true,'user','Outro'),('manager',true,'manager','Gestor');
 CREATE TABLE m8_customer_directory(person_id bigint,name text,document text,payload jsonb,collected_at timestamptz DEFAULT now(),company_id int);INSERT INTO m8_customer_directory VALUES(1,'Cliente','123','{"municipioNome":"Lages","ufSigla":"SC"}',now(),1),(1,'Cliente','123','{}',now(),2);
 CREATE TABLE web_sales_leads(id uuid,name text,city text,uf text,address text,created_at timestamptz DEFAULT now(),owner text);INSERT INTO web_sales_leads(id,name,owner) VALUES('11111111-1111-4111-8111-111111111111','Meu lead','seller'),('22222222-2222-4222-8222-222222222222','Lead privado','other');
 CREATE TABLE web_contact_job_types(id bigint,name text,m8_id bigint);INSERT INTO web_contact_job_types VALUES(1,'Compras',8);
 CREATE TABLE web_customer_contacts(id uuid,customer_key text,m8_id bigint,job_version int,job_type_override_id bigint,job_title text,cargo_id bigint,field_overrides jsonb,name text,phone text,email text,additional_phone text,document text,notes text,integration_state text);
 INSERT INTO web_customer_contacts(id,customer_key,job_version,job_type_override_id,field_overrides,name,phone,email,integration_state) VALUES('33333333-3333-4333-8333-333333333333','m8:1',2,1,'{"name":"Contato ajustado","email":"novo@example.com"}','Contato original','49999999999','antigo@example.com','synced'),('44444444-4444-4444-8444-444444444444','lead:22222222-2222-4222-8222-222222222222',1,NULL,'{}','Privado','','','local');`);
 assert.equal((await crmDirectory('customers','',1,'seller')).total,1);
 assert.equal((await crmDirectory('leads','',1,'seller')).total,1);
 assert.equal((await crmDirectory('leads','',1,'manager')).total,2);
 const contacts=await crmDirectory('contacts','novo@example.com',1,'seller');assert.equal(contacts.total,1);assert.equal(contacts.rows[0].name,'Contato ajustado');assert.equal(contacts.rows[0].job_title,'Compras');
 assert.equal((await crmDirectory('contacts','',1,'seller')).total,1);assert.equal((await crmDirectory('contacts','',1,'manager')).total,2);
 await assert.rejects(()=>crmDirectory('contacts','',1,'missing'));
 }finally{g.historyPool=old;await db.close()}
});
