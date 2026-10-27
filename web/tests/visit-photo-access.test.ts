import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {getVisitPhoto} from '../lib/visits/photos';
import {Forbidden} from '../lib/auth';

test('all active profiles can view photos of customers and leads owned by other users',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE web_user_access(email text,enabled boolean,role text,job_title text,display_name text);
   INSERT INTO web_user_access VALUES ('admin@test',true,'admin','Gestor','Admin'),('seller@test',true,'user','Vendedor','Seller'),('tech@test',true,'user','Técnico','Tech'),('office@test',true,'user','Administrativo','Office'),('disabled@test',false,'admin','Gestor','Disabled');
   CREATE TABLE web_sales_visits(id text,customer_key text,seller text);
   INSERT INTO web_sales_visits VALUES ('v1','m8:1','other@test'),('v2','lead:other','other@test');
   CREATE TABLE web_visit_photos(id text,visit_id text,content bytea);
   INSERT INTO web_visit_photos VALUES ('p1','v1',decode('0102','hex')),('p2','v2',decode('0304','hex'));`);
  for(const email of ['admin@test','seller@test','tech@test','office@test']) {
   assert.deepEqual(new Uint8Array((await getVisitPhoto('p1',email,db)).content),new Uint8Array([1,2]));
   assert.deepEqual(new Uint8Array((await getVisitPhoto('p2',email,db)).content),new Uint8Array([3,4]));
   assert.equal(await getVisitPhoto('missing',email,db),null);
  }
  for(const email of ['disabled@test','unknown@test'])await assert.rejects(()=>getVisitPhoto('p2',email,db),Forbidden);
 } finally {await db.close();}
});
