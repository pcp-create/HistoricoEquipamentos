import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {canOpenPath,userModules} from '../user-modules';
import {CrmError,text,uuid,version} from './model';
import {missingProposalFields,proposalRequiresEquipment,proposalFieldNames} from './proposal-required';
import {initialProposalWorkflow,transitionProposalWorkflow} from './proposal-workflow';

/** Atomically assign or complete a review; callers must also enforce CRM route access. */
export async function changeProposalReview(input:any, actor:string) {
 const id=uuid(input?.id), expected=version(input?.version);
 if(!['request_review','complete_review'].includes(input?.action))throw new CrmError('Ação de revisão inválida.');
 const c=await database().connect();
 try {
  await c.query('BEGIN READ WRITE');
  const proposal=(await c.query('SELECT p.*,o.customer_name,o.lead_id,o.status opportunity_status FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1 FOR UPDATE OF p,o',[id])).rows[0];
  if(!proposal||proposal.version!==expected)throw new CrmError('A proposta foi alterada. Atualize antes de continuar.');
  if(['won','converting','lost','cancelled'].includes(proposal.status))throw new CrmError('Esta proposta não está disponível para revisão.');
  if(proposal.opportunity_status!=='open')throw new CrmError('A oportunidade não está disponível para revisão.');
  if((await c.query("SELECT 1 FROM crm_proposal_email_attempts WHERE proposal_id=$1 AND state IN ('sending','uncertain')",[id])).rows.length)throw new CrmError('Há um envio de e-mail em andamento ou aguardando conferência.');
  await c.query('INSERT INTO crm_proposal_workflows(proposal_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
  const row=(await c.query('SELECT * FROM crm_proposal_workflows WHERE proposal_id=$1 FOR UPDATE',[id])).rows[0];
  const current={state:row.state,revision:row.revision,lastSentRevision:row.last_sent_revision} as ReturnType<typeof initialProposalWorkflow>;
  let next;try{next=transitionProposalWorkflow(current,input.action);}catch{throw new CrmError('A revisão não pode ser alterada nesta etapa.');}
  if(input.action==='complete_review'){
   const types=(await c.query('SELECT id,equipment_required FROM m8_order_type_catalog WHERE id=$1',[proposal.document?.type||null])).rows;
   const missing=missingProposalFields(proposal.document,proposalRequiresEquipment(proposal.document,types),!!proposal.lead_id);
   if(missing.length)throw new CrmError('Preencha os campos obrigatórios: '+missing.map(key=>proposalFieldNames[key]).join(', ')+'.');
  }
  if(input.action==='request_review'){
   const reviewer=text(input.reviewer,254,true).toLowerCase(), comment=text(input.comment??'',2000);
   const employee=(await c.query('SELECT * FROM web_user_access WHERE email=$1 AND enabled',[reviewer])).rows[0];
   if(!employee||!canOpenPath(userModules(employee),'/crm'))throw new CrmError('Selecione um funcionário ativo com acesso ao CRM.');
   const task=(await c.query(`INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,customer,source_status,priority,assigned_to,first_assigned_at,created_by,updated_by,followers) VALUES($1,$2,'CRM',$3,$4,$5,'Aguardando revisão','normal',$6,now(),$7,$7,$8::text[]) RETURNING id`,[`manual:crm-review:${id}:${randomUUID()}`,String(next.revision),`Revisar proposta PROP-${proposal.number} · Rev.${next.revision}`,proposal.names?.equipment||'',proposal.customer_name,reviewer,actor,reviewer===actor?[]:[actor]])).rows[0];
   await c.query('INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,false,$4,coalesce((SELECT display_name FROM web_user_access WHERE email=$4),$4))',[task.id,'Solicitação de revisão',comment||'Revisão de proposta solicitada.',actor]);
   await c.query('INSERT INTO web_task_notifications(task_id,task_version,recipient) VALUES($1,1,$2)',[task.id,reviewer]);
   await c.query("UPDATE crm_proposal_workflows SET state=$2,revision=$3,reviewer=$4,review_requested_by=$5,review_task_id=$6,reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE proposal_id=$1",[id,next.state,next.revision,reviewer,actor,task.id]);
  } else {
   if(row.reviewer!==actor)throw new CrmError('Somente o funcionário designado pode concluir esta revisão.');
   await c.query("UPDATE crm_proposal_workflows SET state='reviewed',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE proposal_id=$1",[id,actor]);
   await c.query("UPDATE web_tasks SET status='completed',source_status='Revisão concluída',source_resolved=true,completed_at=now(),updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1",[row.review_task_id,actor]);
  }
  const updated=(await c.query('UPDATE crm_proposals SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING version',[id,actor])).rows[0];
  await c.query('INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,$4,$5::jsonb)',[proposal.opportunity_id,id,actor,input.action,JSON.stringify({revision:next.revision,reviewer:input.action==='request_review'?input.reviewer:actor})]);
  await c.query('COMMIT');return {...next,version:updated.version};
 } catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
}
