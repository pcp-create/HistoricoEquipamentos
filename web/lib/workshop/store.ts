import {searchPatterns} from "@/lib/filters";
import 'server-only';
import {randomUUID} from 'node:crypto';
import {database} from '../db';
import {effectiveStage,stageOptions,isRentalSource} from './model';
import {workshopVisits} from './visits';
import {listWorkshopEvents} from './task-history';
import {workshopFinancial,workshopFinancialOrders,workshopOrderItems} from './financial';
export class WorkshopInputError extends Error{}
export class WorkshopConflict extends Error{}
const text=(v:unknown,max=4000)=>{if(typeof v!=='string'||v.trim().length>max)throw new WorkshopInputError('Confira os campos informados.');return v.trim();};
const positive=(v:unknown)=>{if(!/^\d{1,18}$/.test(String(v))||BigInt(String(v))<1n)throw new WorkshopInputError('Identificador inválido.');return String(v);};
const uuid=(v:unknown)=>{if(typeof v!=='string'||!/^[0-9a-f-]{36}$/i.test(v))throw new WorkshopInputError('Registro inválido.');return v;};
const date=(v:unknown)=>{if(v==null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new WorkshopInputError('Data inválida.');return v;};
export async function workshopSearch(q:string,quotes=false){
 const term=text(q,120);if(term.length<2)return [];
 if(quotes)return (await database().query(`SELECT company_id,id::text,number,client,status FROM m8_quotes WHERE concat_ws(' ',id,number,client) ILIKE ALL($1::text[]) AND status NOT IN ('Concretizado','Cancelado','Perdido') ORDER BY id,company_id LIMIT 40`,[searchPatterns(term)])).rows;
 return (await database().query(`SELECT e.equipment_id::text id,e.name,e.model,e.serial,
 (SELECT max(person_name) FROM m8_person_equipment p WHERE p.equipment_id=e.equipment_id AND p.present) client
 FROM m8_equipment_catalog e WHERE e.present AND concat_ws(' ',e.equipment_id,e.name,e.model,e.serial) ILIKE ALL($1::text[])
 AND NOT EXISTS(SELECT 1 FROM web_workshop_visits v WHERE v.equipment_id=e.equipment_id AND v.exited_at IS NULL AND v.reconciled_out_at IS NULL)
 ORDER BY e.equipment_id LIMIT 40`,[searchPatterns(term)])).rows;
}
export async function workshopData(email:string){
 const db=database();
 const [access,locations,externalResult]=await Promise.all([
  db.query("SELECT role='admin' AS admin FROM web_user_access WHERE email=$1",[email]),
  db.query('SELECT id::text,name,active FROM web_workshops ORDER BY id'),
  db.query('SELECT * FROM web_workshop_external ORDER BY sent_at DESC'),
 ]);
 const admin=access.rows[0]?.admin===true,workshops=locations.rows,external=externalResult.rows;
 const visits=await workshopVisits(db,admin);
 const [financialOrders,events]=await Promise.all([
  workshopFinancialOrders(db,[...new Set<string>(visits.map(v=>v.equipment_id).filter(Boolean))]),
  listWorkshopEvents(db,visits.map(v=>v.id),admin),
 ]);
 for(const v of visits){v.rental=v.rental||isRentalSource(v.source);v.financial=workshopFinancial(financialOrders.get(v.equipment_id)||[],v.rental,!!v.equipment_id);}
 return {workshops,external:external.filter(e=>!e.returned_at&&!e.reconciled_out_at).map(e=>{const v=visits.find(v=>v.id===e.visit_id);return {...e,machine:v||{id:null,equipment_id:e.source?.equipmentId||null,name:e.source?.equipment_description||e.component,client:e.source?.customer||'Cliente a confirmar',model:null,serial:null,workshop_id:e.source?.workshopId||null,workshop:'Oficina a confirmar',orders:[],tasks:[],external:[]}};}),visits:visits.map(v=>({...v,effective_stage:effectiveStage(v.stage,v.orders,v.source),external:external.filter(e=>e.visit_id===v.id&&!e.reconciled_out_at),events:events.filter(e=>e.visit_id===v.id)}))};
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
   if(b.action==='notes'){
    const notes=text(b.notes);
    await c.query('UPDATE web_workshop_visits SET notes=$2 WHERE id=$1',[id,notes]);
    action='Observação alterada';eventDocument={previousNotes:visit.notes||'',notes};
   }else if(b.action==='deliveryDate'){
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

export async function workshopFinancialDetail(id:string){
 const db=database();
 const visit=(await db.query(`SELECT v.equipment_id::text,v.source,COALESCE(e.payload->>'familiaId'='3',false) rental FROM web_workshop_visits v LEFT JOIN m8_equipment_catalog e ON e.equipment_id=v.equipment_id WHERE v.id=$1`,[uuid(id)])).rows[0];
 if(!visit)throw new WorkshopInputError('Entrada da oficina não encontrada.');
 const grouped=await workshopFinancialOrders(db,visit.equipment_id?[visit.equipment_id]:[]);
 const financial=workshopFinancial(grouped.get(visit.equipment_id)||[],visit.rental||isRentalSource(visit.source),!!visit.equipment_id);
 return {financial,orders:await workshopOrderItems(db,financial.orders)};
}
