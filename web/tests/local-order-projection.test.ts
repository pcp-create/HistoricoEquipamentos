import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {canUseCreatedOrderProjection} from '../lib/service-orders/local-projection';
test('instant detail is limited to confirmed creations in the same company and yields to later completed edits',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;g.historyPool={query:db.query.bind(db)};
 try{
  await db.exec(`CREATE TABLE service_order_submissions(company_id int,m8_id bigint,state text,updated_at timestamptz);
  CREATE TABLE service_order_edits(company_id int,m8_id bigint,state text,updated_at timestamptz);
  INSERT INTO service_order_submissions VALUES(1,777,'complete','2026-11-18T12:00:00Z'),(2,777,'uncertain','2026-11-18T12:00:00Z');`);
  assert.equal(await canUseCreatedOrderProjection('1','777'),true);
  assert.equal(await canUseCreatedOrderProjection('2','777'),false);
  assert.equal(await canUseCreatedOrderProjection('1','888'),false);
  await db.exec("INSERT INTO service_order_edits VALUES(1,777,'complete','2026-11-18T11:00:00Z'),(2,777,'complete','2026-11-18T13:00:00Z'),(1,777,'ready','2026-11-18T14:00:00Z')");
  assert.equal(await canUseCreatedOrderProjection('1','777'),true);
  await db.exec("UPDATE service_order_edits SET state='complete' WHERE state='ready'");
  assert.equal(await canUseCreatedOrderProjection('1','777'),false);
 }finally{g.historyPool=old;await db.close();}
});
