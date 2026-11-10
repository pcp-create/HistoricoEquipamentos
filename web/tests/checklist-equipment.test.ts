import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {isChecklistEquipmentLinked} from '../lib/service-scheduling/checklist-equipment';

test('stale equipment links use explicit current OS IDs and retain isolation and removal checks',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,present boolean);
   INSERT INTO m8_equipment_catalog VALUES(7,true),(8,true);
   CREATE TABLE m8_order_equipment_links(equipment_id bigint,company_id integer,order_id bigint,stale boolean);
   INSERT INTO m8_order_equipment_links VALUES(7,1,100,true);
   CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,produto_equipamento_id bigint,payload jsonb);
   INSERT INTO m8_ordens_servico VALUES(1,100,NULL,'{"produtoEquipamentoId":"7"}');`);
  const linked=(equipment='7',company=1,order=100)=>isChecklistEquipmentLinked(db,equipment,company,order);
  assert.equal(await linked(),true);
  assert.equal(await linked('8'),false);
  assert.equal(await linked('7',2),false);
  assert.equal(await linked('7',1,101),false);
  assert.equal(await isChecklistEquipmentLinked(db,'8',1,100,'8'),true);
  assert.equal(await isChecklistEquipmentLinked(db,'7',1,100,'8'),false);
  assert.equal(await isChecklistEquipmentLinked(db,'999',1,100,'999'),false);
  await db.exec('UPDATE m8_equipment_catalog SET present=false WHERE equipment_id=7');
  assert.equal(await isChecklistEquipmentLinked(db,'7',1,100,'7'),false);
  assert.equal(await linked(),false);
  await db.exec('UPDATE m8_equipment_catalog SET present=true');
  await db.exec('UPDATE m8_ordens_servico SET produto_equipamento_id=8');
  assert.equal(await linked(),false);
  assert.equal(await linked('8'),true);
  await db.exec("UPDATE m8_ordens_servico SET produto_equipamento_id=NULL,payload='{}'");
  assert.equal(await linked(),false);
  await db.exec('UPDATE m8_order_equipment_links SET stale=false');
  assert.equal(await linked(),true);
 }finally{await db.close();}
});

test('operation without equipment preserves and submits its meter only as report content',async()=>{
 const {updateChecklist,prepareChecklistSubmission}=await import('../lib/service-scheduling/checklist-store');
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE web_service_operations(id text PRIMARY KEY,document jsonb,status text,version int,updated_at timestamptz,updated_by text);
   CREATE TABLE web_service_operation_events(operation_id text,action text,actor text,description text);
   CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);`);
  const template={id:'test',name:'Teste',items:[],stages:[{id:'s',name:'Medições',fields:[{id:'meter',label:'Horímetro',type:'meter',required:true}]}]};
  const document={responsible:'tech',checklistRun:{template,stages:{s:{status:'released',answers:{}}},equipmentId:''}};
  await db.query("INSERT INTO web_service_operations VALUES('op',$1,'executing',1,now(),'tech')",[JSON.stringify(document)]);
  const initial=(await db.query<any>("SELECT * FROM web_service_operations WHERE id='op'")).rows[0];
  const draft={action:'checklist_save',stageId:'s',answers:{meter:12028},equipmentId:'',meterDate:'2026-11-06'};
  const saved=await updateChecklist(db,draft,initial,{company_id:1,order_id:100},{},'tech',false);
  assert.equal(saved.document.checklistRun.stages.s.answers.meter,12028);
  assert.equal(saved.document.checklistRun.equipmentId,'');
  assert.equal(saved.document.checklistRun.meterDate,undefined);
  assert.doesNotThrow(()=>prepareChecklistSubmission(saved.document.checklistRun,'tech',saved.document));
  assert.throws(()=>prepareChecklistSubmission(saved.document.checklistRun,'tech'),/equipamento/);
  await assert.doesNotReject(updateChecklist(db,draft,saved,{company_id:1,order_id:100},{},'tech',false,{submittingReport:true}));
  const pinned=structuredClone(saved);pinned.document.equipmentId='7';
  await assert.rejects(updateChecklist(db,{...draft,equipmentId:'invalid'},pinned,{company_id:1,order_id:100},{},'tech',false),/equipamento/);
 }finally{await db.close();}
});

test('review of an unlinked operation warns without touching any equipment or preventive',async()=>{
 const {reviewChecklist}=await import('../lib/service-scheduling/checklist-review');
 const {unlinkedMeterWarning}=await import('../lib/service-scheduling/meter-equipment');
 const document={equipmentId:'',checklistRun:{template:{items:[],stages:[{id:'s',name:'Leitura',fields:[{id:'meter',label:'Horímetro',type:'meter',required:true}]}]},equipmentId:'999',meterDate:'2026-11-06',stages:{s:{status:'submitted',answers:{meter:12028}}}}};
 const result=await reviewChecklist({query(){throw Error('No equipment SQL is allowed');}},{id:'op',document},{company_id:1,order_id:100},{},'planner');
 assert.equal(result.checklistRun.stages.s.answers.meter,12028);
 assert.equal(result.checklistRun.reviewApplied.meterUpdated,false);
 assert.equal(result.checklistRun.reviewApplied.preventiveUpdated,false);
 assert.equal(result.checklistRun.reviewApplied.reason,'operation_without_equipment');
 assert.match(unlinkedMeterWarning(result),/somente no relatório/);
});
