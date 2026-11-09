import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {attachmentPayload,attachmentTarget,decodeAttachment,uploadOrderAttachment,listOrderAttachments,downloadOrderAttachment} from '../lib/service-orders/attachments';
test('attachment contract uses nome/arquivo Base64 and validates target, size and filename',()=>{
 assert.deepEqual(attachmentPayload('relatório.pdf',Buffer.from('example')),{nome:'relatório.pdf',arquivo:'ZXhhbXBsZQ=='});
 assert.throws(()=>attachmentPayload('../file.pdf',Buffer.from('a')),/Nome/);
 assert.throws(()=>attachmentPayload('a.pdf',Buffer.alloc(0)),/3 MB/);
 assert.throws(()=>attachmentPayload('a.pdf',Buffer.alloc(3*1024*1024+1)),/3 MB/);
 assert.throws(()=>attachmentTarget('9','123'),/Empresa/);
 assert.throws(()=>attachmentTarget('1','../123'),/OS/);
 assert.deepEqual(decodeAttachment({arquivo:'ZXhhbXBsZQ=='}),Buffer.from('example'));
 assert.throws(()=>decodeAttachment({arquivo:'data:text/plain;base64,ZXhhbXBsZQ=='}),/inválido/);
});
test('M8 attachment upload is company-scoped, deduplicated, audited and never retries uncertain POST',async()=>{
 const db=new PGlite(),g=globalThis as any,pool=g.historyPool,originalFetch=globalThis.fetch;
 const keys=['M8_API_URL','M8_TENANT','M8_USERNAME','M8_PASSWORD'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let posts=0,mode='ok';const calls:{url:string;body:any}[]=[];
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);');
  await db.exec(readFileSync('sql/096_order_attachments.sql','utf8'));
  const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
  for(const k of keys)process.env[k]=k==='M8_API_URL'?'https://erp.test':'fixture';
  globalThis.fetch=async(input:any,init:any)=>{
   const url=String(input),body=init?.body?JSON.parse(init.body):undefined;calls.push({url,body});
   if(url.endsWith('/auth/token'))return Response.json({data:{token:'test-token'}});
   if(init?.method==='POST'){
    posts++;if(mode==='uncertain')throw Error('connection lost');
    if(mode==='rejected')return Response.json({errors:[{message:'Arquivo recusado'}]},{status:400});
    return Response.json({data:{id:123}});
   }
   if(url.endsWith('/123'))return Response.json({data:{tipo:'pdf',arquivo:'ZXhhbXBsZQ=='}});
   return Response.json({data:[{id:123,descricao:'relatório.pdf'}]});
  };
  const file=Buffer.from('example');
  assert.deepEqual(await uploadOrderAttachment('1','15128','relatório.pdf',file,'planner@test.com'),{id:'123'});
  assert.deepEqual(calls.find(c=>c.url.endsWith('/15128/anexo'))?.body,{nome:'relatório.pdf',arquivo:'ZXhhbXBsZQ=='});
  assert.equal((await uploadOrderAttachment('1','15128','relatório.pdf',file,'planner@test.com')).alreadySent,true);assert.equal(posts,1);
  await uploadOrderAttachment('2','15128','relatório.pdf',file,'planner@test.com');assert.equal(posts,2);
  assert.equal((await query('SELECT * FROM web_access_events')).rows.length,2);
  mode='uncertain';await assert.rejects(()=>uploadOrderAttachment('1','15128','incerto.pdf',file,'planner@test.com'),/não confirmou/);
  const attempted=posts;await assert.rejects(()=>uploadOrderAttachment('1','15128','incerto.pdf',file,'planner@test.com'),/não repete/);assert.equal(posts,attempted);
  mode='rejected';await assert.rejects(()=>uploadOrderAttachment('1','15128','recusado.pdf',file,'planner@test.com'),/recusado/);
  mode='ok';await uploadOrderAttachment('1','15128','recusado.pdf',file,'planner@test.com');
  await uploadOrderAttachment('1','15128','gerado.pdf',Buffer.from('PDF metadata A'),'planner@test.com','snapshot-1');
  const generatedPosts=posts;
  assert.equal((await uploadOrderAttachment('1','15128','gerado.pdf',Buffer.from('PDF metadata B'),'planner@test.com','snapshot-1')).alreadySent,true);
  assert.equal(posts,generatedPosts,'generated PDF metadata must not cause duplicate uploads');
  mode='uncertain';
  await assert.rejects(uploadOrderAttachment('1','15128','gerado-incerto.pdf',file,'planner@test.com','snapshot-2'));
  const uncertainPosts=posts;
  await assert.rejects(uploadOrderAttachment('1','15128','gerado-incerto.pdf',Buffer.from('different metadata'),'planner@test.com','snapshot-2'),/não repete/);
  assert.equal(posts,uncertainPosts);
  mode='ok';
  assert.deepEqual(await listOrderAttachments('1','15128'),[{id:'123',name:'relatório.pdf'}]);
  assert.deepEqual((await downloadOrderAttachment('1','15128','123')).bytes,file);
 }finally{
  globalThis.fetch=originalFetch;g.historyPool=pool;
  for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
  await db.close();
 }
});
