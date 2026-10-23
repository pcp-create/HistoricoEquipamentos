import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {effectiveStage,stageOptions} from './model';
export class WorkshopInputError extends Error{}
export class WorkshopConflict extends Error{}
const text=(v:unknown,max=4000)=>{if(typeof v!=='string'||v.trim().length>max)throw new WorkshopInputError('Confira os campos informados.');return v.trim();};
const positive=(v:unknown)=>{if(!/^\d{1,18}$/.test(String(v))||BigInt(String(v))<1n)throw new WorkshopInputError('Identificador inválido.');return String(v);};
const uuid=(v:unknown)=>{if(typeof v!=='string'||!/^[0-9a-f-]{36}$/i.test(v))throw new WorkshopInputError('Registro inválido.');return v;};
const date=(v:unknown)=>{if(v==null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new WorkshopInputError('Data inválida.');return v;};
const orderLink=`(o.produto_equipamento_id=v.equipment_id OR EXISTS(SELECT 1 FROM m8_order_equipment_links l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.equipment_id=v.equipment_id AND NOT l.stale))`;
export async function workshopSearch(q:string,quotes=false){
 const term=text(q,120);if(term.length<2)return [];
 if(quotes)return (await database().query(`SELECT company_id,id::text,number,client,status FROM m8_quotes WHERE concat_ws(' ',id,number,client) ILIKE $1 AND status NOT IN ('Concretizado','Cancelado','Perdido') ORDER BY id,company_id LIMIT 40`,['%'+term.replace(/[\\%_]/g,'\\$&')+'%'])).rows;
 return (await database().query(`SELECT e.equipment_id::text id,e.name,e.model,e.serial,
 (SELECT max(person_name) FROM m8_person_equipment p WHERE p.equipment_id=e.equipment_id AND p.present) client
 FROM m8_equipment_catalog e WHERE e.present AND concat_ws(' ',e.equipment_id,e.name,e.model,e.serial) ILIKE $1
 AND NOT EXISTS(SELECT 1 FROM web_workshop_visits v WHERE v.equipment_id=e.equipment_id AND v.exited_at IS NULL AND v.reconciled_out_at IS NULL)
 ORDER BY e.equipment_id LIMIT 40`,['%'+term.replace(/[\\%_]/g,'\\$&')+'%'])).rows;
}
export async function workshopData(email:string){
 const db=database();const admin=(await db.query("SELECT role='admin' AS admin FROM web_user_access WHERE email=$1",[email])).rows[0]?.admin===true;
 const workshops=(await db.query('SELECT id::text,name,active FROM web_workshops ORDER BY id')).rows;
 const visits=(await db.query(`SELECT v.*,v.equipment_id::text,COALESCE(e.name,v.source->>'equipment_description') name,e.model,e.serial,COALESCE(w.name,'Oficina a confirmar') workshop,
 COALESCE(NULLIF(v.source->>'customer',''),(SELECT max(person_name) FROM m8_person_equipment p WHERE p.equipment_id=v.equipment_id AND p.present)) client,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id_m8::text,'company',o.company_id,'number',COALESCE(o.numero_sequencia,o.id_m8)::text,'status',o.status,'status_lancamento_nome',o.status_lancamento_nome)) FROM m8_ordens_servico o WHERE o.status IN ('Pendente','Aprovado') AND ${orderLink}),'[]') orders,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id::text,'title',t.title,'status',t.status)) FROM web_tasks t WHERE t.status<>'completed' AND (NOT t.restricted OR $1::boolean) AND (t.equipment_id=v.equipment_id OR EXISTS(SELECT 1 FROM m8_ordens_servico o WHERE o.company_id=t.order_company AND o.id_m8=t.order_id AND ${orderLink}))),'[]') tasks,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id::text,'company',q.company_id,'number',q.number,'status',q.status)) FROM web_workshop_quotes l JOIN m8_quotes q ON q.company_id=l.company_id AND q.id=l.quote_id WHERE l.visit_id=v.id),'[]') quotes,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'number',q.number,'client',q.client_name)) FROM web_quotes q WHERE q.document->>'equipmentId'=v.equipment_id::text AND q.document->>'deletedAt' IS NULL),'[]') drafts
 FROM web_workshop_visits v LEFT JOIN web_workshops w ON w.id=v.workshop_id LEFT JOIN m8_equipment_catalog e ON e.equipment_id=v.equipment_id
 ORDER BY v.entered_at DESC`,[admin])).rows;
 const ids=visits.map(v=>v.id);
 const external=(await db.query('SELECT * FROM web_workshop_external ORDER BY sent_at DESC')).rows;
 const events=(await db.query(`SELECT e.*,COALESCE(u.display_name,e.actor) actor_name FROM web_workshop_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE visit_id=ANY($1::uuid[]) ORDER BY e.created_at DESC,e.id DESC`,[ids])).rows;
 const imports=(await db.query("SELECT id,sheet,row_number,document,reason FROM web_workshop_imports WHERE state='pending' ORDER BY sheet,row_number")).rows;
 return {workshops,imports,external:external.filter(e=>!e.returned_at&&!e.reconciled_out_at).map(e=>{const v=visits.find(v=>v.id===e.visit_id);return {...e,machine:v||{id:null,equipment_id:e.source?.equipmentId||null,name:e.source?.equipment_description||e.component,client:e.source?.customer||'Cliente a confirmar',model:null,serial:null,workshop_id:e.source?.workshopId||null,workshop:'Oficina a confirmar',orders:[],tasks:[],external:[]}};}),visits:visits.map(v=>({...v,effective_stage:effectiveStage(v.stage,v.orders,v.source),external:external.filter(e=>e.visit_id===v.id&&!e.reconciled_out_at),events:events.filter(e=>e.visit_id===v.id)}))};
}
export async function workshopMutate(b:any,email:string){
 if(!b||typeof b.action!=='string')throw new WorkshopInputError('Ação inválida.');
 const c=await database().connect();
 try{await c.query('BEGIN READ WRITE');
  let confirmedVisit:any=null;
  if(b.action==='externalUpdate'){
   const id=uuid(b.externalId),row=(await c.query('SELECT * FROM web_workshop_external WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row||row.returned_at||row.reconciled_out_at||row.version!==b.version)throw new WorkshopConflict('Este envio mudou. Atualize a tela antes de salvar.');
   if(typeof b.returned!=='boolean'||!['approval','quotation','repair','ready'].includes(b.status))throw new WorkshopInputError('Situação inválida.');
   const expected=date(b.expectedAt);
   await c.query('UPDATE web_workshop_external SET status=$2,expected_at=$3,returned_at=CASE WHEN $4 THEN now() ELSE NULL END,version=version+1,source=source||$5::jsonb WHERE id=$1',[id,b.status,expected,b.returned,JSON.stringify({last_updated_by:email,last_updated_at:new Date().toISOString(),previous_status:row.status,history:[...(row.source?.history||[]),{at:new Date().toISOString(),actor:email,previousStatus:row.status,status:b.status,previousExpectedAt:row.expected_at,expectedAt:expected,returned:b.returned}]})]);
   if(row.visit_id){await c.query("INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,$2,$3,$4)",[row.visit_id,b.returned?'Retorno de conserto externo: '+row.component:'Situação do conserto externo atualizada',email,JSON.stringify({externalId:id,status:b.status,previous:row.status})]);await c.query('UPDATE web_workshop_visits SET version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1',[row.visit_id,email]);}
  }else if(b.action==='workshop'){
   const name=text(b.name,100);if(!name)throw new WorkshopInputError('Informe o nome da oficina.');
   if(b.id){if(typeof b.active!=='boolean')throw new WorkshopInputError('Situação inválida.');const exists=(await c.query('SELECT id FROM web_workshops WHERE id=$1 FOR UPDATE',[positive(b.id)])).rows[0];if(!exists)throw new WorkshopInputError('Oficina não encontrada.');
    if(!b.active&&(await c.query('SELECT 1 FROM web_workshop_visits WHERE workshop_id=$1 AND exited_at IS NULL AND reconciled_out_at IS NULL',[b.id])).rows.length)throw new WorkshopInputError('Dê saída nas máquinas antes de desativar a oficina.');
    await c.query('UPDATE web_workshops SET name=$2,active=$3 WHERE id=$1',[b.id,name,b.active]);
   }else await c.query('INSERT INTO web_workshops(name) VALUES($1)',[name]);
  }else if(b.action==='entry'){
   const equipment=positive(b.equipmentId),workshop=positive(b.workshopId),notes=text(b.notes||'');
   if(!(await c.query('SELECT 1 FROM m8_equipment_catalog WHERE equipment_id=$1 AND present',[equipment])).rows.length)throw new WorkshopInputError('Selecione um equipamento cadastrado.');
   if(!(await c.query('SELECT 1 FROM web_workshops WHERE id=$1 AND active FOR SHARE',[workshop])).rows.length)throw new WorkshopInputError('Selecione uma oficina ativa.');
   const entered=new Date(b.enteredAt);if(!Number.isFinite(entered.getTime())||entered.getTime()>Date.now()+60000)throw new WorkshopInputError('A entrada deve ter uma data válida e não pode ser futura.');
   const expected=date(b.expectedAt);if(expected&&expected<entered.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))throw new WorkshopInputError('A previsão não pode ser anterior à entrada.');
   const id=randomUUID();await c.query('INSERT INTO web_workshop_visits(id,equipment_id,workshop_id,entered_at,expected_at,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7)',[id,equipment,workshop,entered,expected,notes,email]);
   await c.query("INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,'Entrada registrada',$2,$3)",[id,email,JSON.stringify({workshopId:workshop,notes})]);
  }else{
   const id=uuid(b.id),visit=(await c.query('SELECT * FROM web_workshop_visits WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!visit)throw new WorkshopInputError('Entrada não encontrada.');
   if(visit.exited_at||visit.reconciled_out_at||b.version!==visit.version)throw new WorkshopConflict('Este registro mudou. Atualize a tela antes de salvar.');
   let action='';let eventDocument:Record<string,unknown>={notes:text(b.notes||'')};
   if(b.action==='deliveryDate'){
    const expected=date(b.expectedAt);
    const entered=new Date(visit.entered_at).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
    if(expected&&expected<entered)throw new WorkshopInputError('A previsão de entrega não pode ser anterior à entrada.');
    const previous=visit.expected_at?(visit.expected_at instanceof Date?visit.expected_at.toISOString().slice(0,10):String(visit.expected_at).slice(0,10)):null;
    await c.query('UPDATE web_workshop_visits SET expected_at=$2 WHERE id=$1',[id,expected]);
    const display=(v:string|null)=>v?v.split('-').reverse().join('/'):'Sem previsão';
    action='Previsão de entrega alterada';eventDocument={previousExpectedAt:previous,expectedAt:expected,notes:`${display(previous)} → ${display(expected)}`};
   }else if(b.action==='stage'){
    if(!stageOptions(visit.source).some(s=>s.id===b.stage))throw new WorkshopInputError('Etapa inválida.');
    await c.query('UPDATE web_workshop_visits SET stage=$2 WHERE id=$1',[id,b.stage]);action='Etapa: '+stageOptions(visit.source).find(s=>s.id===b.stage)!.label;eventDocument={...eventDocument,previousStage:visit.stage,nextStage:b.stage};
   }else if(b.action==='exit'){
    if((await c.query('SELECT 1 FROM web_workshop_external WHERE visit_id=$1 AND returned_at IS NULL AND reconciled_out_at IS NULL',[id])).rows.length)throw new WorkshopInputError('Registre o retorno dos componentes enviados para conserto externo antes da saída.');
    await c.query('UPDATE web_workshop_visits SET exited_at=now(),exit_notes=$2 WHERE id=$1',[id,text(b.notes||'')]);action='Saída registrada';
   }else if(b.action==='external'){
    const component=text(b.component,160),supplier=text(b.supplier,160);if(!component||!supplier)throw new WorkshopInputError('Informe o componente e o prestador.');
    const expected=date(b.expectedAt);if(expected&&expected<new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))throw new WorkshopInputError('A previsão de retorno não pode estar no passado.');
    await c.query('INSERT INTO web_workshop_external(id,visit_id,component,supplier,sent_at,expected_at,notes,created_by) VALUES($1,$2,$3,$4,now(),$5,$6,$7)',[randomUUID(),id,component,supplier,expected,text(b.notes||''),email]);action='Enviado para conserto externo: '+component;
   }else if(b.action==='return'){
    const result=await c.query('UPDATE web_workshop_external SET returned_at=now(),version=version+1 WHERE id=$1 AND visit_id=$2 AND returned_at IS NULL RETURNING component',[uuid(b.externalId),id]);
    if(!result.rows.length)throw new WorkshopConflict('Este componente já retornou ou não pertence à entrada.');action='Retorno de conserto externo: '+result.rows[0].component;
   }else if(b.action==='quote'){
    const company=positive(b.company),quote=positive(b.quoteId);if(!(await c.query('SELECT 1 FROM m8_quotes WHERE company_id=$1 AND id=$2',[company,quote])).rows.length)throw new WorkshopInputError('Orçamento não encontrado.');
    await c.query('INSERT INTO web_workshop_quotes VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,company,quote]);action='Orçamento vinculado';
   }else throw new WorkshopInputError('Ação inválida.');
   const updated=(await c.query('UPDATE web_workshop_visits SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING id,stage,version',[id,email])).rows[0];
   const event=(await c.query('INSERT INTO web_workshop_events(visit_id,action,actor,document) VALUES($1,$2,$3,$4) RETURNING *',[id,action,email,JSON.stringify(eventDocument)])).rows[0];
   if(b.action==='stage')confirmedVisit={...updated,event:{...event,actor_name:email}};
  }
  await c.query('COMMIT');return {saved:true,...(confirmedVisit?{visit:confirmedVisit}:{})};
 }catch(e){await c.query('ROLLBACK');if((e as any).code==='23505')throw new WorkshopConflict('Essa máquina já possui uma entrada aberta na oficina.');throw e;}finally{c.release();}
}
