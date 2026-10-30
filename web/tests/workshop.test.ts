import {equipmentWorkshopStatus} from "../lib/workshop/equipment-status";
import {resolveRentalStatus} from "../lib/equipment-management/rental-status";
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {workshopMutate} from '../lib/workshop/store';import {hasPartsShortage,effectiveStage,daysInWorkshop,stageOptions} from '../lib/workshop/model';
test('workshop computes elapsed days and follows explicit OS material shortages',()=>{assert.equal(effectiveStage('repair',[{status_lancamento_nome:'22 - O.S FALTANDO PEÇAS'}]),'repair');assert.equal(effectiveStage('repair',[]),'repair');assert.equal(daysInWorkshop('2026-10-20T12:00:00Z','2026-10-22T12:00:00Z'),2);});
test('entries prevent duplicates; external parts block exit; version conflicts and history are preserved',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;CREATE TABLE m8_equipment_catalog(equipment_id bigint,present boolean);INSERT INTO m8_equipment_catalog VALUES(100,true);');
  await db.exec(readFileSync(new URL('../sql/067_workshop.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../sql/068_workshop_reconciliation.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../sql/069_workshop_external_position.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../sql/070_workshop_rental_stages.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../sql/088_workshop_equipment_registrations.sql',import.meta.url),'utf8'));
  const entry={action:'entry',equipmentId:'100',workshopId:'1',enteredAt:'2025-01-01T12:00:00Z',notes:'Entrada'};
  await workshopMutate(entry,'planner');await assert.rejects(()=>workshopMutate(entry,'planner'),/já possui/);
  let v=(await db.query<any>('SELECT * FROM web_workshop_visits')).rows[0];
  const workshop=(await equipmentWorkshopStatus(['100'])).get('100');
  assert.ok(workshop?.workshop);assert.equal(resolveRentalStatus([],0,workshop).key,'in_review');
  assert.equal(resolveRentalStatus([],0,workshop).workshop,workshop.workshop);
  await db.query('UPDATE web_workshop_visits SET reconciled_out_at=now() WHERE id=$1',[v.id]);
  assert.equal((await equipmentWorkshopStatus(['100'])).size,0);
  await db.query('UPDATE web_workshop_visits SET reconciled_out_at=NULL WHERE id=$1',[v.id]);
  await workshopMutate({action:'external',id:v.id,version:1,component:'Motor',supplier:'Prestador'},'planner');
  await assert.rejects(()=>workshopMutate({action:'stage',id:v.id,version:1,stage:'ready'},'planner'),/mudou/);
  await assert.rejects(()=>workshopMutate({action:'exit',id:v.id,version:2},'planner'),/retorno/);
  await assert.rejects(()=>workshopMutate({action:'workshop',id:'1',active:false,name:'Oficina'},'planner'),/saída/);
  const external=(await db.query<any>('SELECT * FROM web_workshop_external')).rows[0];
  await workshopMutate({action:'return',id:v.id,version:2,externalId:external.id},'planner');
  await workshopMutate({action:'exit',id:v.id,version:3,notes:'Entregue'},'planner');
  const afterExit=(await equipmentWorkshopStatus(['100'])).get('100') || null;
  assert.equal(afterExit,null);assert.equal(resolveRentalStatus([],1,afterExit).key,'available');
  v=(await db.query<any>('SELECT * FROM web_workshop_visits')).rows[0];assert.ok(v.exited_at);assert.equal(v.version,4);
  assert.equal((await db.query('SELECT * FROM web_workshop_events')).rows.length,4);
  await workshopMutate(entry,'planner');assert.equal((await db.query('SELECT * FROM web_workshop_visits')).rows.length,2);
  const open=(await db.query<any>('SELECT * FROM web_workshop_visits WHERE exited_at IS NULL')).rows[0];
  await db.query('UPDATE web_workshop_visits SET reconciled_out_at=now() WHERE id=$1',[open.id]);
  await assert.rejects(()=>workshopMutate({action:'stage',id:open.id,version:open.version,stage:'repair'},'planner'),/mudou/);
  await workshopMutate(entry,'planner');
  await db.exec(`INSERT INTO web_workshop_visits(id,entered_at,stage,created_by,updated_by) VALUES('00000000-0000-4000-8000-000000000001','2026-01-01','factory_warranty','Importação','Importação')`);
  assert.equal((await db.query('SELECT * FROM web_workshop_visits WHERE exited_at IS NULL AND reconciled_out_at IS NULL')).rows.length,2);
  const editable=(await db.query<any>('SELECT * FROM web_workshop_visits WHERE equipment_id=100 AND exited_at IS NULL AND reconciled_out_at IS NULL')).rows[0];
  await assert.rejects(()=>workshopMutate({action:'deliveryDate',id:editable.id,version:editable.version,expectedAt:'2024-12-01'},'planner'),/anterior/);
  await workshopMutate({action:'deliveryDate',id:editable.id,version:editable.version,expectedAt:'2026-11-05'},'planner');
  assert.equal((await db.query<any>('SELECT expected_at::text expected_at FROM web_workshop_visits WHERE id=$1',[editable.id])).rows[0].expected_at,'2026-11-05');
  const event=(await db.query<any>("SELECT document FROM web_workshop_events WHERE visit_id=$1 AND action='Previsão de entrega alterada'",[editable.id])).rows[0];
  assert.equal(event.document.expectedAt,'2026-11-05');assert.equal(event.document.previousExpectedAt,null);
  await assert.rejects(()=>workshopMutate({action:'deliveryDate',id:editable.id,version:editable.version,expectedAt:'2026-11-06'},'planner'),/mudou/);
  await workshopMutate({action:'deliveryDate',id:editable.id,version:editable.version+1,expectedAt:''},'planner');
  assert.equal((await db.query<any>('SELECT expected_at::text expected_at FROM web_workshop_visits WHERE id=$1',[editable.id])).rows[0].expected_at,null);
  const confirmation=await workshopMutate({action:'stage',id:editable.id,version:editable.version+2,stage:'repair'},'planner');
  assert.equal(confirmation.visit.id,editable.id);assert.equal(confirmation.visit.version,editable.version+3);assert.equal(confirmation.visit.stage,'repair');
  assert.equal(confirmation.visit.event.document.previousStage,'received');assert.equal(confirmation.visit.event.document.nextStage,'repair');
  const persisted=(await db.query<any>('SELECT * FROM web_workshop_events WHERE id=$1',[confirmation.visit.event.id])).rows[0];
  assert.equal(new Date(confirmation.visit.event.created_at).getTime(),new Date(persisted.created_at).getTime());
  const standalone='00000000-0000-4000-8000-000000000002';
  await db.query("INSERT INTO web_workshop_external(id,component,supplier,sent_at,status,created_by) VALUES($1,'Motor','Fornecedor','2026-01-01','approval','Importação')",[standalone]);
  await workshopMutate({action:'externalUpdate',externalId:standalone,version:1,status:'quotation',returned:false,expectedAt:'2026-11-01'},'planner');
  await assert.rejects(()=>workshopMutate({action:'externalUpdate',externalId:standalone,version:1,status:'repair',returned:false},'planner'),/mudou/);
  await workshopMutate({action:'externalUpdate',externalId:standalone,version:2,status:'ready',returned:true},'planner');
  assert.ok((await db.query<any>('SELECT returned_at FROM web_workshop_external WHERE id=$1',[standalone])).rows[0].returned_at);



  const imported='00000000-0000-4000-8000-000000000001';
  await db.query('UPDATE web_workshop_visits SET notes=$2,source=$3 WHERE id=$1',[imported,'Texto da planilha',JSON.stringify({sheet:'Equipamentos em Oficina',row:362})]);
  await workshopMutate({action:'notes',id:imported,version:1,notes:'Texto revisado\nNova informação'},'planner');
  const noteVisit=(await db.query<any>('SELECT * FROM web_workshop_visits WHERE id=$1',[imported])).rows[0];
  assert.equal(noteVisit.notes,'Texto revisado\nNova informação');assert.equal(noteVisit.version,2);assert.equal(noteVisit.source.row,362);assert.equal(noteVisit.updated_by,'planner');
  const noteEvent=(await db.query<any>("SELECT * FROM web_workshop_events WHERE visit_id=$1 AND action='Observação alterada'",[imported])).rows[0];
  assert.equal(noteEvent.document.previousNotes,'Texto da planilha');assert.equal(noteEvent.document.notes,noteVisit.notes);assert.equal(noteEvent.actor,'planner');
  await assert.rejects(()=>workshopMutate({action:'notes',id:imported,version:1,notes:'Sobrescrever'},'other'),/mudou/);
  await assert.rejects(()=>workshopMutate({action:'notes',id:imported,version:2,notes:'x'.repeat(4001)},'planner'),/campos/);
  await workshopMutate({action:'notes',id:imported,version:2,notes:''},'planner');
  assert.equal((await db.query<any>('SELECT notes FROM web_workshop_visits WHERE id=$1',[imported])).rows[0].notes,'');

 }finally{g.historyPool=old;await db.close();}
});

test('approval groups and selectable labels follow machine origin without changing stored status',()=>{
 const rental={sheet:'Equipamentos Locação em revisão'};
 assert.equal(effectiveStage('approval',[],rental),'approval_internal');
 assert.equal(effectiveStage('approval',[],{sheet:'Equipamentos em Oficina'}),'approval');
 assert.equal(stageOptions(rental).find(s=>s.id==='approval')?.label,'Aguardando aprovação interna');
 assert.equal(stageOptions().find(s=>s.id==='approval')?.label,'Aguardando aprovação do cliente');
 assert.equal(effectiveStage('approval',[{status_lancamento_nome:'Aguardando peças'}],rental),'approval_internal');
 assert.ok(!stageOptions(rental).some(s=>s.id==='approval_internal'));
});

test('parts shortages remain flagged while the machine advances through recorded stages',()=>{
 const orders=[{status_lancamento_nome:'22 - O.S FALTANDO PEÇAS'}];
 assert.equal(hasPartsShortage(orders),true);
 for(const stage of ['parts','diagnosis','repair','ready']) assert.equal(effectiveStage(stage,orders),stage);
 assert.equal(hasPartsShortage([{status_lancamento_nome:'Serviço executado'}]),false);
});

test('entry reversal preserves audit history, frees equipment and requires reason and returned external parts',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);g.historyPool={query,connect:async()=>({query,release(){}})};
 try {
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE m8_equipment_catalog(equipment_id bigint,present boolean);INSERT INTO m8_equipment_catalog VALUES(100,true);');
  for(const f of ['067_workshop','068_workshop_reconciliation','069_workshop_external_position','070_workshop_rental_stages'])await db.exec(readFileSync(new URL('../sql/'+f+'.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../sql/088_workshop_equipment_registrations.sql',import.meta.url),'utf8'));
  const entry={action:'entry',equipmentId:'100',workshopId:'1',enteredAt:'2026-01-01T12:00:00Z'};
  await workshopMutate(entry,'planner');
  const v=(await db.query<any>('SELECT * FROM web_workshop_visits')).rows[0];
  await assert.rejects(()=>workshopMutate({action:'reverse',id:v.id,version:1,notes:'  '},'planner'),/justificativa/);
  await workshopMutate({action:'external',id:v.id,version:1,component:'Motor',supplier:'Prestador'},'planner');
  await assert.rejects(()=>workshopMutate({action:'reverse',id:v.id,version:2,notes:'Duplicidade'},'planner'),/retorno/);
  const ext=(await db.query<any>('SELECT id FROM web_workshop_external')).rows[0];
  await workshopMutate({action:'return',id:v.id,version:2,externalId:ext.id},'planner');
  await assert.rejects(()=>workshopMutate({action:'reverse',id:v.id,version:2,notes:'Duplicidade'},'planner'),/mudou/);
  await workshopMutate({action:'reverse',id:v.id,version:3,notes:'Entrada registrada por engano'},'planner');
  const reversed=(await db.query<any>('SELECT * FROM web_workshop_visits WHERE id=$1',[v.id])).rows[0];
  assert.equal(reversed.exited_at,null);assert.ok(reversed.reconciled_out_at);assert.equal(reversed.source.entry_reversed,true);assert.equal(reversed.version,4);
  assert.equal((await equipmentWorkshopStatus(['100'])).size,0);
  const event=(await db.query<any>("SELECT * FROM web_workshop_events WHERE visit_id=$1 AND action='Entrada estornada'",[v.id])).rows[0];
  assert.equal(event.actor,'planner');assert.equal(event.document.notes,'Entrada registrada por engano');
  await assert.rejects(()=>workshopMutate({action:'reverse',id:v.id,version:4,notes:'Repetido'},'planner'),/mudou/);
  await workshopMutate(entry,'planner');assert.equal((await db.query('SELECT * FROM web_workshop_visits')).rows.length,2);
 } finally {g.historyPool=old;await db.close();}
});
