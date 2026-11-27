import 'server-only';
import {CrmError,text} from './model';

export function lossDetails(input:any) {
 const reason=text(input?.reason??'',4000),actionPlan=text(input?.actionPlan??'',4000);
 if(!reason||!actionPlan)throw new CrmError('Informe a justificativa da perda e o plano de ação para evitar novas perdas.');
 return {reason,actionPlan};
}
/** Called inside the opportunity transaction, after its version lock. */
export async function createOpportunityLossTask(c:any,opportunity:any,actor:string,loss:{reason:string;actionPlan:string}) {
 const employee=(await c.query('SELECT to_jsonb(u)->\'managers\' managers FROM web_user_access u WHERE email=$1 AND enabled',[actor])).rows[0];
 const managers=Array.isArray(employee?.managers)?employee.managers.filter((email:any)=>typeof email==='string'&&email.toLowerCase()!==actor.toLowerCase()).map((email:string)=>email.trim().toLowerCase()):[];
 const users=managers.length?(await c.query('SELECT email,phone FROM web_user_access WHERE enabled AND lower(email)=ANY($1::text[])',[managers])).rows:[];
 const manager=managers.map((email:string)=>users.find((u:any)=>u.email.toLowerCase()===email)).find(Boolean);
 if(!manager)throw new CrmError('Cadastre um gestor imediato ativo para o usuário antes de registrar a perda.');
 if(!manager.phone?.trim())throw new CrmError('Cadastre o WhatsApp do gestor imediato para receber a tarefa.');
 const description=`Oportunidade OP-${opportunity.number} · ${opportunity.title}\nCliente: ${opportunity.customer_name}\n\nJustificativa da perda:\n${loss.reason}\n\nPlano de ação para evitar novas perdas:\n${loss.actionPlan}\n\n/crm?tab=opportunities&opportunity=${opportunity.id}`;
 const task=(await c.query(`INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,customer,source_status,priority,assigned_to,first_assigned_at,created_by,updated_by,followers,task_type,approval_state,approval_description,approval_approver)
 VALUES($1,$2,'CRM',$3,'',$4,'Aguardando aprovação do plano de ação','normal',$5,now(),$6,$6,ARRAY[$6]::text[],'approval','pending',$7,$5) RETURNING id`,[
 `manual:crm-loss:${opportunity.id}:${opportunity.version}`,String(opportunity.version),`Aprovar plano de ação · Perda OP-${opportunity.number}`,opportunity.customer_name,manager.email,actor,description])).rows[0];
 await c.query(`INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Perda de oportunidade registrada',$2,true,$3,coalesce((SELECT display_name FROM web_user_access WHERE email=$3),$3))`,[task.id,description,actor]);
 await c.query("INSERT INTO web_task_notifications(task_id,task_version,recipient,kind,assignment_reason) VALUES($1,1,$2,'assignment',$3)",[task.id,manager.email,'Analisar a justificativa da perda e aprovar o plano de ação.']);
 return {...loss,taskId:String(task.id),manager:manager.email};
}
