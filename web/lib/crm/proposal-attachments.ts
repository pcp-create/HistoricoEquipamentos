import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {allowedTaskAttachment,taskAttachmentTypeMessage} from '../tasks/attachment-types';
import {CrmError,uuid} from './model';

export const proposalAttachmentMaxBytes=3*1024*1024;
export async function proposalAttachments(proposalId:string){
 const id=uuid(proposalId),db=database();
 if(!(await db.query('SELECT 1 FROM crm_proposals WHERE id=$1',[id])).rows.length)throw new CrmError('Proposta não encontrada.');
 return (await db.query(`SELECT a.id,a.filename,octet_length(a.content)::int size,a.created_at,COALESCE(NULLIF(trim(u.display_name),''),a.created_by) created_name FROM crm_proposal_attachments a LEFT JOIN web_user_access u ON u.email=a.created_by WHERE a.proposal_id=$1 ORDER BY a.created_at DESC,a.id DESC`,[id])).rows;
}
export async function proposalAttachment(proposalId:string,attachmentId:string){
 const row=(await database().query('SELECT filename,content FROM crm_proposal_attachments WHERE proposal_id=$1 AND id=$2',[uuid(proposalId),uuid(attachmentId)])).rows[0];
 if(!row)throw new CrmError('Anexo não encontrado.');return row;
}
export async function addProposalAttachment(proposalId:string,file:File,actor:string){
 const id=uuid(proposalId),name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').trim();
 if(!name||name.length>180)throw new CrmError('Informe um nome de arquivo com até 180 caracteres.');
 if(!allowedTaskAttachment(name))throw new CrmError(taskAttachmentTypeMessage);
 if(!file.size||file.size>proposalAttachmentMaxBytes)throw new CrmError('Envie um arquivo não vazio de até 3 MB.');
 const bytes=Buffer.from(await file.arrayBuffer()),db=database(),c=await db.connect();
 try{await c.query('BEGIN READ WRITE');
  const proposal=(await c.query('SELECT id,opportunity_id FROM crm_proposals WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!proposal)throw new CrmError('Proposta não encontrada.');
  if(Number((await c.query('SELECT count(*) n FROM crm_proposal_attachments WHERE proposal_id=$1',[id])).rows[0].n)>=20)throw new CrmError('Limite de 20 anexos por proposta.');
  const attachment=randomUUID();await c.query('INSERT INTO crm_proposal_attachments(id,proposal_id,filename,content,created_by) VALUES($1,$2,$3,$4,$5)',[attachment,id,name,bytes,actor]);
  await c.query("INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'attachment_added',$4::jsonb)",[proposal.opportunity_id,id,actor,JSON.stringify({id:attachment,filename:name})]);
  await c.query('COMMIT');return {id:attachment};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function removeProposalAttachment(proposalId:string,attachmentId:string,actor:string){
 const id=uuid(proposalId),attachment=uuid(attachmentId),c=await database().connect();
 try{await c.query('BEGIN READ WRITE');
  const proposal=(await c.query('SELECT id,opportunity_id FROM crm_proposals WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!proposal)throw new CrmError('Proposta não encontrada.');
  const row=(await c.query('DELETE FROM crm_proposal_attachments WHERE proposal_id=$1 AND id=$2 RETURNING filename',[id,attachment])).rows[0];
  if(!row)throw new CrmError('Anexo não encontrado.');
  await c.query("INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'attachment_removed',$4::jsonb)",[proposal.opportunity_id,id,actor,JSON.stringify({id:attachment,filename:row.filename})]);
  await c.query('COMMIT');return {ok:true};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
