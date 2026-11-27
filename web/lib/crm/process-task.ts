import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {CrmError} from './model';

// Responsável indicado para a separação de peças das propostas do CRM.
export const proposalWarehouseEmail='paulo@rjcompressores.com.br';
export async function warehouseResponsible(c:Pick<PoolClient,'query'>){
 const user=(await c.query('SELECT email,phone FROM web_user_access WHERE email=$1 AND enabled',[proposalWarehouseEmail])).rows[0];
 if(!user)throw new CrmError('O responsável pela separação de peças (Paulo Duwe) precisa estar ativo.');
 if(!user.phone?.trim())throw new CrmError('Cadastre o WhatsApp do responsável pela separação de peças (Paulo Duwe).');
 return user.email as string;
}
export async function proposalSeller(c:Pick<PoolClient,'query'>,document:any){
 const email=String(document?.commercial?.sellerEmail||'').trim().toLowerCase();
 const users=(await c.query('SELECT email,phone FROM web_user_access WHERE enabled AND lower(email)=$1',[email])).rows;
 if(users.length!==1)throw new CrmError('Selecione o vendedor responsável no portal, no cabeçalho da proposta, para receber a tarefa e a notificação.');
 if(!users[0].phone?.trim())throw new CrmError('Cadastre o WhatsApp do vendedor responsável no portal antes de concluir a revisão.');
 return users[0].email as string;
}
/** Caller holds the proposal/workflow lock. Assignment and outbox are committed together. */
export async function assignProposalTask(c:Pick<PoolClient,'query'>,proposal:any,workflow:any,recipient:string,actor:string,status:string,title:string,reason:string){
 let task;
 if(workflow.review_task_id){
  task=(await c.query(`UPDATE web_tasks SET assigned_to=$2,title=$3,source_status=$4,
   status='not_started',kanban_column='pending',source_resolved=false,completed_at=NULL,first_assigned_at=coalesce(first_assigned_at,now()),
   followers=CASE WHEN assigned_to IS NOT NULL AND assigned_to<>$2 AND NOT assigned_to=ANY(coalesce(followers,ARRAY[]::text[])) THEN array_append(coalesce(followers,ARRAY[]::text[]),assigned_to) ELSE followers END,
   updated_by=$5,updated_at=now(),version=version+1 WHERE id=$1 RETURNING id,version`,[workflow.review_task_id,recipient,title,status,actor])).rows[0];
 }
 if(!task){
  task=(await c.query(`INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,customer,source_status,priority,assigned_to,first_assigned_at,created_by,updated_by,followers)
   VALUES($1,$2,'CRM',$3,$4,$5,$6,'normal',$7,now(),$8,$8,$9::text[]) RETURNING id,version`,[
    `manual:crm-review:${proposal.id}:${randomUUID()}`,String(workflow.revision||0),title,proposal.names?.equipment||'',proposal.customer_name||'',status,recipient,actor,recipient===actor?[]:[actor]
   ])).rows[0];
  await c.query('UPDATE crm_proposal_workflows SET review_task_id=$2 WHERE proposal_id=$1',[proposal.id,task.id]);
 }
 await c.query(`INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,true,$4,coalesce((SELECT display_name FROM web_user_access WHERE email=$4),$4))`,[task.id,'Responsável do processo atualizado',reason,actor]);
 await c.query(`INSERT INTO web_task_notifications(task_id,task_version,recipient,kind,assignment_reason) VALUES($1,$2,$3,'assignment',$4) ON CONFLICT DO NOTHING`,[task.id,task.version,recipient,reason]);
 return task;
}
export async function assignOrderSeparation(c:PoolClient,proposalId:string,actor:string,order:string){
 const proposal=(await c.query('SELECT p.*,o.customer_name FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1',[proposalId])).rows[0];
 await c.query('INSERT INTO crm_proposal_workflows(proposal_id) VALUES($1) ON CONFLICT DO NOTHING',[proposalId]);
 const workflow=(await c.query('SELECT * FROM crm_proposal_workflows WHERE proposal_id=$1 FOR UPDATE',[proposalId])).rows[0];
 await assignProposalTask(c,proposal,workflow,await warehouseResponsible(c),actor,'Aguardando separação de peças',`Separar peças · OS-${order} · PROP-${proposal.number}`,`Pedido de venda OS-${order} gerado. Responsabilidade transferida ao almoxarifado para separação de peças.`);
}
