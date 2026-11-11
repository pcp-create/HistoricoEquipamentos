import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {addOrderComment,orderComments} from '../lib/service-orders/comments';
test('comments capture the authenticated name and database time in the OS log and deduplicate retries',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE TABLE web_user_access(email text,display_name text,enabled boolean);INSERT INTO web_user_access VALUES('author','Nome Original',true),('disabled','Desativado',false);
  CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint);INSERT INTO m8_ordens_servico VALUES(1,100),(2,100);
  CREATE TABLE web_access_events(id bigint GENERATED ALWAYS AS IDENTITY,event text,email text,actor text,details jsonb,created_at timestamptz DEFAULT now());`);
  const input={company:'1',order:'100',requestId:randomUUID(),comment:'  Cliente aguardando aprovação.\nRetornar amanhã.  ',authorName:'Nome inventado',at:'2000-01-01'};
  const saved=await addOrderComment(input,'author');assert.deepEqual(await addOrderComment(input,'author'),saved);
  await assert.rejects(addOrderComment({...input,company:'2'},'author'),/já foi usado/);
  await assert.rejects(addOrderComment({...input,requestId:randomUUID()},'disabled'));
  await assert.rejects(addOrderComment({...input,requestId:randomUUID(),order:'999'},'author'),/não encontrada/);
  await assert.rejects(addOrderComment({...input,requestId:randomUUID(),comment:' '},'author'));
  await assert.rejects(addOrderComment({...input,requestId:randomUUID(),comment:'a'.repeat(8001)},'author'));
  await db.exec("UPDATE web_user_access SET display_name='Nome Atual' WHERE email='author'");
  let result=await orderComments('1','100');assert.equal(result.rows.length,1);assert.equal(result.rows[0].author,'Nome Original');assert.equal(result.rows[0].comment,input.comment.trim());assert.ok(Date.now()-new Date(result.rows[0].at).getTime()<60000);
  const log:any=(await query('SELECT * FROM web_access_events')).rows[0];assert.equal(log.event,'service_order_comment_added');assert.equal(log.actor,'author');assert.equal(log.details.company,'1');assert.equal(log.details.order,'100');
  assert.equal((await orderComments('2','100')).rows.length,0);
  await db.exec(`INSERT INTO web_access_events(event,email,actor,details) SELECT 'service_order_comment_added','author','author','{"company":"1","order":"100","comment":"Mais um"}'::jsonb FROM generate_series(1,51);`);
  result=await orderComments('1','100');assert.equal(result.rows.length,50);assert.equal(result.hasMore,true);
  const next=await orderComments('1','100',result.rows.at(-1).id);assert.equal(next.rows.length,2);assert.equal(next.hasMore,false);
 }finally{g.historyPool=old;await db.close();}
});
