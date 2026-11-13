import {proposalOrderDraft} from './financials';
import 'server-only';
import {database} from '../db';
import {prepareOrder,advanceOrder,retryOrder} from '../service-orders/store';
import {OrderInputError} from '../service-orders/model';
import {CrmError,uuid,version,proposalDraft,positive} from './model';
const defaults={prepare:prepareOrder,advance:advanceOrder,retry:retryOrder};
async function transaction<T>(work:(c:any)=>Promise<T>){const c=await database().connect();try{await c.query('BEGIN READ WRITE');const r=await work(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function recordResult(link:any,r:any){
 await transaction(async c=>{
 const current=(await c.query('SELECT state,order_id FROM crm_order_links WHERE id=$1 FOR UPDATE',[link.id])).rows[0];
 const persisted=(await c.query('SELECT state,m8_id,message FROM service_order_submissions WHERE id=$1 FOR SHARE',[link.submission_id])).rows[0];
 if(persisted)r={...r,state:persisted.state,m8Id:persisted.m8_id,message:persisted.message};
 if(current?.state==='complete')r={...r,state:'complete',m8Id:current.order_id};
 await c.query('UPDATE crm_order_links SET state=$2,order_id=$3,message=$4,updated_at=now() WHERE id=$1',[link.id,r.state,r.m8Id||null,r.message||null]);
 if(r.state==='complete'){
  const p=(await c.query("UPDATE crm_proposals SET status='won',version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1 AND status<>'won' RETURNING opportunity_id",[link.proposal_id,link.actor])).rows[0];
  if(p)await c.query(`INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'proposal_converted',$4::jsonb)`,[p.opportunity_id,link.proposal_id,link.actor,JSON.stringify({company:link.company_id,order:r.m8Id})]);
 }
 });
 return {...r,linkId:link.id};
}
/** Reserve locally before any ERP write. Every retry uses the same persisted submission. */
export async function beginConversion(raw:any,actor:string,deps=defaults){
 const id=uuid(raw.id),proposal=uuid(raw.proposalId),expected=version(raw.version);
 const link=await transaction(async c=>{
 const p=(await c.query('SELECT p.*,o.status opportunity_status FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1 FOR UPDATE OF p',[proposal])).rows[0];
 if(!p)throw new CrmError('Proposta não encontrada.');
 const old=(await c.query('SELECT * FROM crm_order_links WHERE id=$1',[id])).rows[0];
 if(old){if(old.actor!==actor||old.proposal_id!==proposal)throw new CrmError('Envio pertence a outro usuário.');if(old.state==='validation_failed')throw new CrmError('Corrija e salve a proposta antes de uma nova tentativa.');return old;}
 const pending=(await c.query("SELECT * FROM crm_order_links WHERE proposal_id=$1 AND state NOT IN('complete','validation_failed')",[proposal])).rows[0];
 if(pending)throw new CrmError('Já existe um envio pendente. Abra o andamento para continuar sem duplicar a OS.');
 if(p.version!==expected)throw new CrmError('A proposta foi alterada. Reabra antes de concretizar.');
 if(p.opportunity_status!=='open'||!['pending','won'].includes(p.status))throw new CrmError('A proposta e a oportunidade precisam estar disponíveis para concretização.');
 if(p.status==='won'&&raw.additional!==true)throw new CrmError('A proposta já foi concretizada. Utilize Gerar outra OS.');
 const draft=proposalDraft(p.document);
 if(raw.orderType)draft.type=String(positive(raw.orderType));
 const mapping=(await c.query(`SELECT 1 FROM crm_proposal_types p JOIN crm_opportunity_types o ON o.id=p.opportunity_type_id JOIN crm_proposal_order_types m ON m.proposal_type_id=p.id JOIN m8_order_type_catalog t ON t.id=m.m8_order_type_id WHERE p.id=$1 AND m.m8_order_type_id=$2 AND p.active AND o.active AND t.active`,[p.type_id,draft.type||null])).rows[0];
 if(!mapping)throw new CrmError('Defina na proposta um tipo de OS ativo, vinculado em Configurações / Cadastros / Tipos de Proposta.');
 const created=(await c.query('INSERT INTO crm_order_links(id,proposal_id,company_id,submission_id,document,actor) VALUES($1,$2,$3,$1,$4::jsonb,$5) RETURNING *',[id,proposal,draft.company,JSON.stringify(draft),actor])).rows[0];
 await c.query("UPDATE crm_proposals SET status='converting',version=version+1,updated_by=$2,updated_at=now() WHERE id=$1",[proposal,actor]);
 await c.query(`INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'conversion_requested',$4::jsonb)`,[p.opportunity_id,proposal,actor,JSON.stringify({link:id,type:draft.type})]);
 return created;
 });
 try{return await recordResult(link,await deps.prepare(actor,link.submission_id,proposalOrderDraft(link.document)));}
 catch(e){
 if(e instanceof OrderInputError){
 await transaction(async c=>{
 // prepareOrder validates without ERP writes; never unlock a proposal if a submission exists.
 const exists=(await c.query('SELECT id FROM service_order_submissions WHERE id=$1',[link.submission_id])).rows.length;
 if(!exists){await c.query("UPDATE crm_order_links SET state='validation_failed',message=$2,updated_at=now() WHERE id=$1",[link.id,e.message]);await c.query("UPDATE crm_proposals SET status=CASE WHEN EXISTS(SELECT 1 FROM crm_order_links WHERE proposal_id=$1 AND state='complete') THEN 'won' ELSE 'pending' END,version=version+1 WHERE id=$1",[link.proposal_id]);}
 });}
 throw e;
 }
}
export async function continueConversion(raw:any,actor:string,deps=defaults){
 const id=uuid(raw.id),link=(await database().query('SELECT * FROM crm_order_links WHERE id=$1',[id])).rows[0];
 if(!link||link.actor!==actor)throw new CrmError('Somente o usuário que iniciou o envio pode continuar esta integração.');
 if(link.state==='validation_failed')throw new CrmError('Corrija e salve a proposta antes de iniciar novamente.');
 if(raw.action==='retry'){
 if(raw.confirmed!==true)throw new CrmError('Confira o resultado no M8 antes de reenviar.');
 return recordResult(link,await deps.retry(actor,link.submission_id,raw.updatedAt,true));
 }
 if(link.state==='preparing')return recordResult(link,await deps.prepare(actor,link.submission_id,proposalOrderDraft(link.document)));
 return recordResult(link,await deps.advance(actor,link.submission_id));
}
