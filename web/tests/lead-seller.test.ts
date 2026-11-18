import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {changeLeadSeller,leadSellerOptions} from '../lib/visits/lead-seller';
import {contactAccess} from '../lib/visits/contacts';
test('lead reassignment checks owner/manager permissions, active sellers, concurrency and preserves visits',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE TABLE web_user_access(email text PRIMARY KEY,enabled boolean DEFAULT true,role text DEFAULT 'user',job_title text DEFAULT 'Vendedor',display_name text);
  INSERT INTO web_user_access(email,role,display_name) VALUES('a@test','user','Vendedor A'),('b@test','user','Vendedor B'),('manager@test','manager','Gestor'),('disabled@test','user','Inativo'),('tech@test','user','Técnico');
  UPDATE web_user_access SET enabled=false WHERE email='disabled@test';UPDATE web_user_access SET job_title='Técnico' WHERE email='tech@test';
  CREATE TABLE web_sales_leads(id uuid PRIMARY KEY,owner text,name text);INSERT INTO web_sales_leads VALUES('11111111-1111-4111-8111-111111111111','a@test','Lead A');
  CREATE TABLE web_sales_visits(id int,seller text,customer_key text,status text);INSERT INTO web_sales_visits VALUES(1,'a@test','lead:11111111-1111-4111-8111-111111111111','scheduled');
  CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);`);
  const key='lead:11111111-1111-4111-8111-111111111111',input={customer_key:key,seller:'b@test',expectedOwner:'a@test'};
  await contactAccess({query},key,'b@test'); // Full-base lead can be used by another seller.
  await assert.rejects(contactAccess({query},key,'disabled@test'));
  await assert.rejects(leadSellerOptions(key,'b@test'));
  assert.equal((await leadSellerOptions(key,'a@test')).owner,'a@test');
  assert.ok(!(await leadSellerOptions(key,'manager@test')).sellers.some(s=>s.id==='disabled@test'||s.id==='tech@test'));
  await assert.rejects(changeLeadSeller(input,'b@test'));
  await assert.rejects(changeLeadSeller(input,'disabled@test'));
  await assert.rejects(changeLeadSeller({...input,seller:'disabled@test'},'a@test'),/ativo/);
  await assert.rejects(changeLeadSeller({...input,seller:'tech@test'},'a@test'),/ativo/);
  await assert.rejects(changeLeadSeller({...input,expectedOwner:'stale@test'},'manager@test'),/alterado/);
  assert.deepEqual(await changeLeadSeller(input,'a@test'),{saved:true});
  assert.equal((await query<any>('SELECT owner FROM web_sales_leads')).rows[0].owner,'b@test');
  assert.equal((await query<any>('SELECT seller FROM web_sales_visits')).rows[0].seller,'a@test');
  const audit=(await query<any>('SELECT actor,details FROM web_access_events')).rows[0];
  assert.equal(audit.actor,'a@test');assert.equal(audit.details.before,'a@test');assert.equal(audit.details.after,'b@test');
  await assert.rejects(changeLeadSeller(input,'manager@test'),/alterado/);
  await changeLeadSeller({...input,seller:'a@test',expectedOwner:'b@test'},'manager@test');
  assert.equal((await query<any>('SELECT owner FROM web_sales_leads')).rows[0].owner,'a@test');
 }finally{g.historyPool=old;await db.close();}
});
