import {hydrateProductCosts} from './product-costs';
import 'server-only';
import {database} from '../db';
import {CrmError,uuid,text,positive,version,proposalDraft,emptyDraft,totalCents,conversionRate} from './model';
async function write<T>(work:(c:any)=>Promise<T>):Promise<T>{const c=await database().connect();try{await c.query('BEGIN READ WRITE');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');if((e as any)?.code==='23505')throw new CrmError('Este código já está cadastrado. Atualize a lista antes de tentar novamente.');throw e;}finally{c.release();}}
async function event(c:any,actor:string,action:string,opportunity:string|null,proposal:string|null,details:any){await c.query('INSERT INTO crm_events(actor,action,opportunity_id,proposal_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',[actor,action,opportunity,proposal,JSON.stringify(details)]);}
export async function catalogs(){
 const db=database();const [o,p,m]=await Promise.all([
 db.query('SELECT * FROM crm_opportunity_types ORDER BY id'),
 db.query(`SELECT p.*,COALESCE((SELECT jsonb_agg(m8_order_type_id::text ORDER BY m8_order_type_id) FROM crm_proposal_order_types m WHERE m.proposal_type_id=p.id),'[]') AS order_types FROM crm_proposal_types p ORDER BY id`),
 db.query('SELECT id::text,name,active FROM m8_order_type_catalog ORDER BY id')]);
 return {opportunityTypes:o.rows,proposalTypes:p.rows,orderTypes:m.rows};
}
export async function crmOverview(){
 const r=(await database().query(`SELECT (SELECT count(*)::int FROM crm_opportunities) opportunities,(SELECT count(*)::int FROM crm_proposals) proposals,
 (SELECT count(*)::int FROM crm_order_links WHERE order_id IS NOT NULL) orders,
 (SELECT count(DISTINCT p.opportunity_id)::int FROM crm_order_links l JOIN crm_proposals p ON p.id=l.proposal_id WHERE l.order_id IS NOT NULL) converted`)).rows[0];
 return {...r,conversion:conversionRate(r.opportunities,r.converted)};
}
export async function listCrm(kind:string,q='',page=1,status=''){
 if(!['opportunities','proposals','orders'].includes(kind)||!Number.isSafeInteger(page)||page<1||page>100000)throw new CrmError('Consulta inválida.');
 const search='%'+text(q,150).replace(/[\\%_]/g,'\\$&')+'%';
 const source=kind==='opportunities'?`SELECT o.*,customer.payload->>'municipioNome' customer_city,customer.payload->>'ufSigla' customer_state,COALESCE(u.display_name,o.created_by) owner_name,t.name type_name,(SELECT count(*)::int FROM crm_proposals WHERE opportunity_id=o.id) proposal_count,(SELECT count(*)::int FROM crm_order_links l JOIN crm_proposals p ON p.id=l.proposal_id WHERE p.opportunity_id=o.id AND l.order_id IS NOT NULL) order_count FROM crm_opportunities o JOIN crm_opportunity_types t ON t.id=o.type_id LEFT JOIN web_user_access u ON u.email=o.created_by LEFT JOIN LATERAL (SELECT d.payload FROM m8_customer_directory d WHERE d.person_id=o.customer_id AND d.company_id=o.company_id LIMIT 1) customer ON true`
 :kind==='proposals'?`SELECT p.id,p.number,p.title,p.status,p.opportunity_id,p.type_id,p.total_cents,p.version,p.created_at,p.updated_at,p.names->>'equipment' equipment_name,o.number opportunity_number,o.customer_name,o.company_id,o.created_by owner_email,t.name type_name,(SELECT count(*)::int FROM crm_order_links WHERE proposal_id=p.id AND order_id IS NOT NULL) order_count FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id JOIN crm_proposal_types t ON t.id=p.type_id`
 :`SELECT l.id,l.proposal_id,l.company_id,l.order_id,l.state,l.message,l.actor,l.created_at,l.updated_at,l.state status,p.number proposal_number,p.opportunity_id,o.number opportunity_number,o.customer_name,p.title FROM crm_order_links l JOIN crm_proposals p ON p.id=l.proposal_id JOIN crm_opportunities o ON o.id=p.opportunity_id`;
 const from=`WITH records AS (${source}) SELECT * FROM records WHERE concat_ws(' ',${kind==='orders'?'order_id,proposal_number':'number'},title,customer_name) ILIKE $1 ESCAPE '\\' AND ($2='' OR status=$2)`;
 const db=database();const [rows,count]=await Promise.all([db.query(from+' ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET $3',[search,status,(page-1)*30]),db.query(`SELECT count(*)::int total FROM (${from}) r`,[search,status])]);
 return {rows:rows.rows,total:count.rows[0].total,page};
}
export async function getOpportunity(id:string){uuid(id);const row=(await database().query('SELECT * FROM crm_opportunities WHERE id=$1',[id])).rows[0];if(!row)throw new CrmError('Oportunidade não encontrada.');return {...row,proposals:(await database().query('SELECT id,number,title,status,total_cents,version FROM crm_proposals WHERE opportunity_id=$1 ORDER BY number',[id])).rows,history:(await database().query('SELECT e.id,e.action,e.actor,e.created_at,COALESCE(u.display_name,e.actor) author FROM crm_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE opportunity_id=$1 ORDER BY e.id DESC LIMIT 100',[id])).rows};}
export async function getProposal(id:string){uuid(id);const row=(await database().query('SELECT p.*,o.number opportunity_number,o.type_id opportunity_type_id,o.customer_name,o.company_id FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1',[id])).rows[0];if(!row)throw new CrmError('Proposta não encontrada.');return {...row,document:await hydrateProductCosts(row.document),links:(await database().query('SELECT l.id,l.company_id,l.order_id,l.state,l.message,l.actor,l.created_at,s.updated_at submission_updated_at FROM crm_order_links l LEFT JOIN service_order_submissions s ON s.id=l.submission_id WHERE l.proposal_id=$1 ORDER BY l.created_at DESC',[id])).rows};}
export async function saveOpportunity(raw:any,actor:string){
 const id=uuid(raw.id),title=text(raw.title,200,true),type=positive(raw.typeId),customer=positive(raw.customerId),company=positive(raw.company);
 if(![1,2,27404].includes(company)||!['open','lost','cancelled'].includes(raw.status??'open'))throw new CrmError('Empresa ou situação inválida.');
 return write(async c=>{
 const t=(await c.query('SELECT id FROM crm_opportunity_types WHERE id=$1 AND active',[type])).rows[0];
 const client=(await c.query('SELECT name FROM m8_customer_directory WHERE person_id=$1 ORDER BY company_id LIMIT 1',[customer])).rows[0];
 if(!t||!client)throw new CrmError('Selecione um tipo ativo e um cliente cadastrado.');
 const old=(await c.query('SELECT * FROM crm_opportunities WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(old&&!raw.version){if(old.created_by===actor)return old;throw new CrmError('Identificador já utilizado.');}
 if(old&&old.version!==version(raw.version))throw new CrmError('A oportunidade foi alterada. Reabra antes de salvar.');
 if(old&&(Number(old.type_id)!==type||Number(old.customer_id)!==customer||old.company_id!==company)&&(await c.query('SELECT id FROM crm_proposals WHERE opportunity_id=$1 LIMIT 1',[id])).rows.length)throw new CrmError('Tipo, cliente e empresa não podem ser trocados após incluir propostas.');
 const details=raw.commercial??old?.commercial??{};
 const stages=['prospecting','qualification','proposal','negotiation','financial','closed'];
 if(!details||typeof details!=='object'||Array.isArray(details))throw new CrmError('Informações comerciais inválidas.');
 const stage=details.stage??'prospecting',probability=Number(details.probability??0),amount=String(details.amount??'');
 const closeDate=text(details.closeDate??'',10),contact=text(details.contact??'',160);
 if(!stages.includes(stage)||!Number.isFinite(probability)||probability<0||probability>100||(amount&&!/^\d{1,10}(\.\d{1,2})?$/.test(amount))||(closeDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(closeDate)||!Number.isFinite(Date.parse(closeDate))||new Date(closeDate).toISOString().slice(0,10)!==closeDate)))throw new CrmError('Confira fase, probabilidade, valor e data de fechamento.');
 const commercial={stage,probability,amount,closeDate,contact};
 const args=[id,type,title,customer,client.name,company,raw.status??'open',text(raw.notes??'',10000),actor,JSON.stringify(commercial)];
 const row=(await c.query(old?`UPDATE crm_opportunities SET type_id=$2,title=$3,customer_id=$4,customer_name=$5,company_id=$6,status=$7,notes=$8,updated_by=$9,updated_at=now(),version=version+1,commercial=$10::jsonb WHERE id=$1 RETURNING *`:`INSERT INTO crm_opportunities(id,type_id,title,customer_id,customer_name,company_id,status,notes,created_by,updated_by,commercial) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10::jsonb) RETURNING *`,args)).rows[0];
 await event(c,actor,old?'opportunity_updated':'opportunity_created',id,null,{before:old,after:row});return row;
 });
}
export async function createProposal(raw:any,actor:string){
 const id=uuid(raw.id),opportunity=uuid(raw.opportunityId),type=positive(raw.typeId),title=text(raw.title,200,true);
 return write(async c=>{
 const existing=(await c.query('SELECT * FROM crm_proposals WHERE id=$1',[id])).rows[0];if(existing){if(existing.created_by!==actor||existing.opportunity_id!==opportunity||Number(existing.type_id)!==type)throw new CrmError('Identificador já utilizado.');return existing;}
 const o=(await c.query('SELECT * FROM crm_opportunities WHERE id=$1 FOR UPDATE',[opportunity])).rows[0];
 const t=(await c.query('SELECT * FROM crm_proposal_types WHERE id=$1 AND active AND opportunity_type_id=$2',[type,o?.type_id])).rows[0];
 if(!o||o.status!=='open'||!t)throw new CrmError('Selecione uma oportunidade aberta e um tipo de proposta compatível.');
 const draft={...emptyDraft(),company:String(o.company_id),customer:String(o.customer_id)};
 const row=(await c.query(`INSERT INTO crm_proposals(id,opportunity_id,type_id,title,document,names,created_by,updated_by) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$7) RETURNING *`,[id,opportunity,type,title,JSON.stringify(draft),JSON.stringify({customer:o.customer_name,equipment:''}),actor])).rows[0];
 await event(c,actor,'proposal_created',opportunity,id,{title,type});return row;
 });
}
export async function saveProposal(raw:any,actor:string){
 const id=uuid(raw.id),expected=version(raw.version);let draft=proposalDraft(raw.draft);
 return write(async c=>{
 const p=(await c.query('SELECT p.*,o.customer_id,o.customer_name,o.company_id FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1 FOR UPDATE OF p',[id])).rows[0];
 if(!p||p.version!==expected)throw new CrmError('A proposta foi alterada. Reabra antes de salvar.');
 if(p.status==='converting'||(await c.query("SELECT 1 FROM crm_order_links WHERE proposal_id=$1 AND state NOT IN('complete','validation_failed') LIMIT 1",[id])).rows.length)throw new CrmError('Existe um envio de OS pendente. Conclua a conferência antes de editar a proposta.');
 if(!(p.status==='won'?['won']:['pending','lost','cancelled']).includes(raw.status??p.status))throw new CrmError('Situação inválida.');
 const proposalTypeId=raw.typeId==null?Number(p.type_id):positive(raw.typeId);
 if(proposalTypeId!==Number(p.type_id)&&!(await c.query('SELECT 1 FROM crm_proposal_types t JOIN crm_opportunities o ON o.type_id=t.opportunity_type_id WHERE t.id=$1 AND o.id=$2 AND t.active',[proposalTypeId,p.opportunity_id])).rows.length)throw new CrmError('Selecione um tipo de proposta ativo e compatível com a oportunidade.');
 draft.company=String(p.company_id);draft.customer=String(p.customer_id);
 draft=await hydrateProductCosts(draft,c);
 if(draft.type&&!(await c.query('SELECT 1 FROM crm_proposal_order_types WHERE proposal_type_id=$1 AND m8_order_type_id=$2',[proposalTypeId,positive(draft.type)])).rows.length)throw new CrmError('O tipo de OS não está vinculado a este tipo de proposta nos cadastros.');
 const names={customer:p.customer_name,equipment:text(raw.names?.equipment??'',500)};
 const result=(await c.query('UPDATE crm_proposals SET title=$2,status=$3,document=$4::jsonb,names=$5::jsonb,total_cents=$6,updated_by=$7,type_id=$8,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *',[id,text(raw.title??p.title,200,true),raw.status??p.status,JSON.stringify(draft),JSON.stringify(names),totalCents(draft),actor,proposalTypeId])).rows[0];
 await event(c,actor,'proposal_updated',p.opportunity_id,id,{before:p.document,after:draft,status:result.status,beforeTypeId:p.type_id,afterTypeId:proposalTypeId});return result;
 });
}
export async function saveCatalog(raw:any,actor:string){
 const kind=raw.kind;if(!['opportunity','proposal'].includes(kind))throw new CrmError('Cadastro inválido.');
 const code=text(raw.code,20,true).toUpperCase(),name=text(raw.name,200,true),notes=text(raw.notes??'',2000),active=raw.active;
 if(!/^[A-Z0-9_-]+$/.test(code)||typeof active!=='boolean')throw new CrmError('Código ou situação inválidos.');
 const table=kind==='opportunity'?'crm_opportunity_types':'crm_proposal_types';
 return write(async c=>{
 const id=raw.id?positive(raw.id):null;
 const old=id?(await c.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0]:null;
 if(id&&(!old||old.version!==version(raw.version)))throw new CrmError('Cadastro alterado. Reabra antes de salvar.');
 const parent=kind==='proposal'?positive(raw.opportunityTypeId):null;
 if(parent&&!(await c.query('SELECT id FROM crm_opportunity_types WHERE id=$1',[parent])).rows.length)throw new CrmError('Tipo de oportunidade inválido.');
 if(old&&kind==='proposal'&&Number(old.opportunity_type_id)!==parent&&(await c.query('SELECT id FROM crm_proposals WHERE type_id=$1 LIMIT 1',[id])).rows.length)throw new CrmError('Tipo de proposta já utilizado: mantenha o tipo de oportunidade.');
 const values=[code,name,notes,active,...(parent?[parent]:[])];
 const row=(await c.query(id?`UPDATE ${table} SET code=$1,name=$2,notes=$3,active=$4,version=version+1${parent?',opportunity_type_id=$5':''} WHERE id=$${values.length+1} RETURNING *`:`INSERT INTO ${table}(code,name,notes,active${parent?',opportunity_type_id':''}) VALUES(${values.map((_,i)=>'$'+(i+1))}) RETURNING *`,id?[...values,id]:values)).rows[0];
 if(kind==='proposal'){
 if(!Array.isArray(raw.orderTypes)||raw.orderTypes.length>30)throw new CrmError('Informe até 30 IDs de tipos de OS.');
 const ids=[...new Set(raw.orderTypes.map(positive))];
 await c.query('DELETE FROM crm_proposal_order_types WHERE proposal_type_id=$1',[row.id]);
 for(const mapped of ids)await c.query('INSERT INTO crm_proposal_order_types VALUES($1,$2)',[row.id,mapped]);
 }
 await event(c,actor,'catalog_updated',null,null,{kind,before:old,after:row,orderTypes:raw.orderTypes});return row;
 });
}
