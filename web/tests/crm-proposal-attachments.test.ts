import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {addProposalAttachment,proposalAttachment,proposalAttachments,removeProposalAttachment,proposalAttachmentMaxBytes} from '../lib/crm/proposal-attachments';

test('proposal attachments are scoped, audited, validated and limited',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,display_name text);INSERT INTO web_user_access VALUES('user@test','Usuário');CREATE TABLE crm_proposals(id uuid PRIMARY KEY,opportunity_id uuid);CREATE TABLE crm_events(opportunity_id uuid,proposal_id uuid,actor text,action text,details jsonb);`);
  await db.exec(readFileSync(new URL('../sql/127_crm_proposal_attachments.sql',import.meta.url),'utf8'));
  const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await query('INSERT INTO crm_proposals VALUES($1,$2),($3,$2)',[id,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',other]);
  const file=new File([Buffer.from('documento')],'proposta.pdf',{type:'application/pdf'}),added=await addProposalAttachment(id,file,'user@test');
  const list=await proposalAttachments(id);assert.equal(list.length,1);assert.equal(list[0].filename,'proposta.pdf');assert.equal(list[0].created_name,'Usuário');assert.equal(Buffer.from((await proposalAttachment(id,added.id)).content).toString(),'documento');
  await assert.rejects(proposalAttachment(other,added.id),/não encontrado/);await assert.rejects(removeProposalAttachment(other,added.id,'user@test'),/não encontrado/);
  await assert.rejects(addProposalAttachment(id,new File(['x'],'arquivo.html'),'user@test'),/Envie fotos/);
  await assert.rejects(addProposalAttachment(id,new File([new Uint8Array(proposalAttachmentMaxBytes+1)],'grande.pdf'),'user@test'),/até 3 MB/);
  await removeProposalAttachment(id,added.id,'user@test');assert.equal((await proposalAttachments(id)).length,0);
  assert.deepEqual((await query<any>('SELECT action FROM crm_events ORDER BY action')).rows.map(r=>r.action),['attachment_added','attachment_removed']);
  for(let i=0;i<20;i++)await addProposalAttachment(id,new File(['x'],`${i}.png`),'user@test');
  await assert.rejects(addProposalAttachment(id,new File(['x'],'extra.png'),'user@test'),/Limite de 20/);
 }finally{g.historyPool=old;await db.close();}
});
