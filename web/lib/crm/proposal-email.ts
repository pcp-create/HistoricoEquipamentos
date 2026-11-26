import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {CrmError,text,uuid,version} from './model';
import {getProposal} from './store';
import {proposalPdf} from './pdf';
import {hydratePdfProductTaxes} from './product-taxes';
import {emailMessage} from '../service-scheduling/customer-email';
import {emailRecipients} from '../service-scheduling/email-recipients';
import {validateCustomerEmail} from '../service-scheduling/customer-email-template';
import {cleanEmailBodyHtml} from '../service-scheduling/email-body-html';

export async function proposalEmailSettings(){const row=(await database().query('SELECT document FROM crm_proposal_email_settings WHERE id=1')).rows[0];return validateCustomerEmail(row?.document);}
export async function proposalEmailDetails(id:string,actor?:string,input?:any){
 const proposal=await getProposal(uuid(id)),db=database();
 const customerKey=proposal.lead_id?'lead:'+proposal.lead_id:proposal.document.customer?'m8:'+proposal.document.customer:'';
 let saved;
 if(input){
  if(!actor||!customerKey)throw new CrmError('Cliente ou lead não disponível para cadastro de contato.');
  const name=text(input.name,160,true),phone=text(input.phone??'',40),job=text(input.job_title??'',160);
  let emails:string[];try{emails=emailRecipients(text(input.email,254,true));}catch(e){throw new CrmError((e as Error).message);}
  if(emails.length!==1||(phone&&!/^[+()\d\s.-]+$/.test(phone)))throw new CrmError('Confira o e-mail e o telefone do contato.');
  const c=await db.connect();try{await c.query('BEGIN READ WRITE');saved=(await c.query(`INSERT INTO web_customer_contacts(id,customer_key,name,phone,email,job_title,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(customer_key,name,phone) WHERE m8_id IS NULL DO UPDATE SET email=EXCLUDED.email,job_title=EXCLUDED.job_title RETURNING id,name,phone,email,job_title`,[randomUUID(),customerKey,name,phone,emails[0],job,actor])).rows[0];await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const [settings,contacts,customer]=await Promise.all([
  db.query('SELECT document FROM crm_proposal_email_settings WHERE id=1'),
  db.query(`SELECT id,COALESCE(to_jsonb(c)->'field_overrides'->>'name',name) name,COALESCE(to_jsonb(c)->'field_overrides'->>'email',email) email,job_title FROM web_customer_contacts c WHERE customer_key=$1 AND to_jsonb(c)->>'deleted_at' IS NULL ORDER BY lower(name),id`,[customerKey]),
  db.query("SELECT payload->>'email' email FROM m8_customer_directory WHERE person_id=$1 AND company_id=$2 LIMIT 1",[proposal.document.customer||null,proposal.company_id]),
 ]);
 return {config:validateCustomerEmail(settings.rows[0]?.document),contacts:contacts.rows,saved,canCreate:!!customerKey,defaultEmail:customer.rows[0]?.email||'',customer:proposal.customer_name,equipment:proposal.names?.equipment||'',number:proposal.number};
}
export async function saveProposalEmailSettings(input:any,actor:string){
 const config=validateCustomerEmail(input);
 if(config.bodyHtml)config.bodyHtml=cleanEmailBodyHtml(config.bodyHtml)!;
 const c=await database().connect();try{await c.query('BEGIN READ WRITE');await c.query('UPDATE crm_proposal_email_settings SET document=$1::jsonb,updated_by=$2,updated_at=now() WHERE id=1',[JSON.stringify(config),actor]);await c.query('COMMIT');return config;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

async function markAttempt(id:string,state:'failed'|'uncertain',error:string){
 const c=await database().connect();try{await c.query('BEGIN READ WRITE');await c.query('UPDATE crm_proposal_email_attempts SET state=$2,error=$3,updated_at=now() WHERE id=$1',[id,state,error]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
const defaultEmailDeps={get:getProposal,render:proposalPdf,taxes:hydratePdfProductTaxes};
async function renderProposalEmail(input:any,deps=defaultEmailDeps){
 const id=uuid(input?.id),expected=version(input?.version);
 let to:string;try{to=emailRecipients(text(input?.to,3000,true)).join(', ');}catch(e){throw new CrmError((e as Error).message);}
 const subject=text(input?.subject,300,true),body=text(input?.body,10000,true);
 const bodyHtml=typeof input?.bodyHtml==='string'?input.bodyHtml:undefined;
 const proposal=await deps.get(id);
 if(proposal.version!==expected||proposal.workflow?.state!=='reviewed')throw new CrmError('A proposta deve estar revisada e atualizada antes do envio.');
 const db=database(),draft=proposal.document;
 const [client,equipment,products]=await Promise.all([
  proposal.lead_id?db.query("SELECT name,jsonb_build_object('municipioNome',city,'ufSigla',uf) payload FROM web_sales_leads WHERE id=$1",[proposal.lead_id]):db.query('SELECT document,payload FROM m8_customer_directory WHERE person_id=$1 AND company_id=$2 LIMIT 1',[draft.customer||null,draft.company]),
  draft.equipment?db.query('SELECT name,model,serial FROM m8_equipment_catalog WHERE equipment_id=$1',[draft.equipment]):Promise.resolve({rows:[]}),
  db.query("SELECT product_id::text code,NULLIF(trim(payload->>'ncm'),'') ncm FROM m8_product_catalog WHERE company_id=$1 AND product_id=ANY($2::bigint[])",[draft.company,draft.items.filter((item:any)=>item.kind==='material').map((item:any)=>item.code)]),
 ]);
 const revision=Number(proposal.workflow.revision);
 const includeTaxes=input?.includeTaxes!==false;
 proposal.document=includeTaxes?await deps.taxes(draft):draft;
 const pdf=await deps.render(proposal,client.rows[0]||{},equipment.rows[0]||{},Object.fromEntries(products.rows.map((p:any)=>[p.code,p.ncm])),{includeTaxes});
 const raw=Buffer.from(emailMessage({to,subject,body,bodyHtml,filename:text(input?.filename || `Proposta-${proposal.number}-Rev-${revision}.pdf`,220,true),pdf})).toString('base64url');
 return {id,expected,to,proposal,draft,pdf,raw,revision};
}
export async function prepareProposalEmail(input:any){
 const prepared=await renderProposalEmail(input);
 return {raw:prepared.raw,filename:`Proposta-${prepared.proposal.number}-Rev-${prepared.revision}.eml`};
}
/** A reserved attempt prevents an ambiguous Gmail response from causing a duplicate send. */
export async function sendProposalEmail(input:any,actor:string,send:typeof fetch=fetch,deps=defaultEmailDeps){
 const token=text(input?.accessToken,4096,true);
 const {id,expected,to,proposal,draft,pdf,raw,revision}=await renderProposalEmail(input,deps),db=database();
 const attempt=randomUUID(),c=await db.connect();
 try{
  await c.query('BEGIN READ WRITE');
  const locked=(await c.query('SELECT p.version,p.status proposal_status,o.status opportunity_status FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1 FOR UPDATE OF p,o',[id])).rows[0];
  const workflow=(await c.query('SELECT * FROM crm_proposal_workflows WHERE proposal_id=$1 FOR UPDATE',[id])).rows[0];
  if(locked?.version!==expected||workflow?.state!=='reviewed'||workflow.revision!==revision)throw new CrmError('A proposta foi alterada. Atualize antes de enviar.');
  if(locked.opportunity_status!=='open'&&!(locked.opportunity_status==='won'&&locked.proposal_status==='won'))throw new CrmError('A oportunidade não está disponível para envio.');
  if((await c.query("SELECT 1 FROM crm_proposal_email_attempts WHERE proposal_id=$1 AND state IN ('sending','uncertain')",[id])).rows.length)throw new CrmError('Há um envio aguardando conferência.');
  await c.query("INSERT INTO crm_proposal_email_attempts(id,proposal_id,revision,proposal_version,actor,recipients,document,names,title,pdf,state) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,'sending')",[attempt,id,revision,expected,actor,to,JSON.stringify(draft),JSON.stringify(proposal.names),proposal.title,Buffer.from(pdf)]);
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 let response:Response;
 try{response=await send('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(45000)});}
 catch{await markAttempt(attempt,'uncertain','Resposta do Gmail não confirmada');throw new CrmError('Não foi possível confirmar o envio. Confira a pasta Enviados antes de qualquer nova tentativa.');}
 const result=await response.json().catch(()=>null);
 if(!response.ok||typeof result?.id!=='string'||!result.id){
  const definite=response.status>=400&&response.status<500&&response.status!==408;
  await markAttempt(attempt,definite?'failed':'uncertain',`Gmail HTTP ${response.status}`);
  throw new CrmError(definite?'O Gmail recusou o envio. Verifique a conexão e tente novamente.':'Não foi possível confirmar o envio. Confira a pasta Enviados antes de qualquer nova tentativa.');
 }
 const finish=await db.connect();
 try{
  await finish.query('BEGIN READ WRITE');
  await finish.query('SELECT id FROM crm_proposals WHERE id=$1 FOR UPDATE',[id]);
  await finish.query(`INSERT INTO crm_proposal_sent_revisions(proposal_id,revision,proposal_version,document,names,title,pdf,sent_by,recipients,gmail_message_id) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10)`,[id,revision,expected,JSON.stringify(draft),JSON.stringify(proposal.names),proposal.title,Buffer.from(pdf),actor,to,result.id]);
  await finish.query("UPDATE crm_proposal_workflows SET state='sent',last_sent_revision=$2,updated_at=now() WHERE proposal_id=$1",[id,revision]);
  await finish.query("UPDATE crm_proposal_email_attempts SET state='sent',message_id=$2,updated_at=now() WHERE id=$1",[attempt,result.id]);
  await finish.query('UPDATE crm_proposals SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1',[id,actor]);
  await finish.query("INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'proposal_sent',$4::jsonb)",[proposal.opportunity_id,id,actor,JSON.stringify({revision,recipients:to,messageId:result.id})]);
  await finish.query('COMMIT');
 }catch(e){await finish.query('ROLLBACK');throw new CrmError('O Gmail confirmou o envio, mas o registro local precisa de conferência. Não envie novamente.');}finally{finish.release();}
 return {revision,messageId:result.id};
}

/** Resolve only after the sender has checked Gmail; never sends another message. */
export async function resolveProposalEmail(input:any,actor:string){
 const id=uuid(input?.id),attemptId=uuid(input?.attemptId);
 if(input?.confirmed!==true||!['sent','not_sent'].includes(input?.resolution))throw new CrmError('Confirme a situação do envio no Gmail.');
 const messageId=input.resolution==='sent'?(input.messageId?text(input.messageId,200,true):`manual:${attemptId}`):'';
 const c=await database().connect();try{
  await c.query('BEGIN READ WRITE');
  const proposal=(await c.query('SELECT * FROM crm_proposals WHERE id=$1 FOR UPDATE',[id])).rows[0];
  const attempt=(await c.query("SELECT * FROM crm_proposal_email_attempts WHERE id=$1 AND proposal_id=$2 AND (state='uncertain' OR (state='sending' AND created_at<now()-interval '2 minutes')) FOR UPDATE",[attemptId,id])).rows[0];
  if(!proposal||!attempt||attempt.actor!==actor)throw new CrmError('Envio pendente indisponível para conferência.');
  const workflow=(await c.query('SELECT * FROM crm_proposal_workflows WHERE proposal_id=$1 FOR UPDATE',[id])).rows[0];
  if(proposal.version!==attempt.proposal_version||workflow?.state!=='reviewed'||workflow.revision!==attempt.revision)throw new CrmError('A proposta foi alterada e precisa de conferência administrativa.');
  if(input.resolution==='sent'){
   await c.query('INSERT INTO crm_proposal_sent_revisions(proposal_id,revision,proposal_version,document,names,title,pdf,sent_by,recipients,gmail_message_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,attempt.revision,attempt.proposal_version,attempt.document,attempt.names,attempt.title,attempt.pdf,actor,attempt.recipients,messageId]);
   await c.query("UPDATE crm_proposal_workflows SET state='sent',last_sent_revision=$2,updated_at=now() WHERE proposal_id=$1",[id,attempt.revision]);
   await c.query("UPDATE crm_proposals SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1",[id,actor]);
  }
  await c.query('UPDATE crm_proposal_email_attempts SET state=$2,message_id=$3,updated_at=now() WHERE id=$1',[attemptId,input.resolution==='sent'?'sent':'failed',messageId||null]);
  await c.query("INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'proposal_email_reconciled',$4::jsonb)",[proposal.opportunity_id,id,actor,JSON.stringify({attempt:attemptId,resolution:input.resolution,messageId})]);
  await c.query('COMMIT');return {resolution:input.resolution};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
