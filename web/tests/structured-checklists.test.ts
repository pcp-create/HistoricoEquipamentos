import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {validateChecklists,validateAnswers,stagesOf,validateFieldDetails} from '../lib/service-scheduling/checklists';
import {reviewChecklist} from '../lib/service-scheduling/checklist-review';
import {validatePreventiveTypes} from '../lib/service-scheduling/preventive-types';
import {updateChecklist} from '../lib/service-scheduling/checklist-store';
import {saveChecklistPhoto,getChecklistPhoto} from '../lib/service-scheduling/checklist-photos';
import ccp from '../lib/service-scheduling/templates/ccp.json';
import sharp from 'sharp';
import {checklistReport} from '../lib/service-scheduling/checklist-report';
import {renderChecklistPdf} from '../lib/service-scheduling/checklist-pdf';
import {PDFDocument} from 'pdf-lib';
import {repairCcpStructure} from '../lib/service-scheduling/ccp-structure';
test('CCP preserves report stages and validates configurable field types',()=>{
 assert.equal(validateChecklists([ccp])[0].stages!.length,6);
 assert.equal(stagesOf(ccp).flatMap(s=>s.fields).filter(f=>f.type==='meter').length,1);
 const inspection=ccp.stages[1];
 assert.throws(()=>validateAnswers(inspection,{},true),/Preencha/);
 assert.throws(()=>validateAnswers(inspection,{[inspection.fields[0].id]:'SIM'},false),/indicador/);
 const broken=structuredClone(ccp);broken.stages[0].groups[0].fields[1].id=broken.stages[0].groups[0].fields[0].id;
 assert.throws(()=>validateChecklists([broken]),/inválido/);
 assert.throws(()=>validateAnswers(ccp.stages[0],{unknown:'x'},false),/inválidas/);
 assert.deepEqual(validateAnswers(ccp.stages[0],{[ccp.stages[0].fields[0].id]:0},true),{[ccp.stages[0].fields[0].id]:0});
});
test('stages freeze templates, restrict technicians, validate photos and update only linked equipment',async()=>{
 const db=new PGlite();const g=globalThis as any,old=g.historyPool;
 g.historyPool={query:db.query.bind(db),connect:async()=>({query:db.query.bind(db),release(){}})};
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  for(const name of ['008_administration','009_employees','028_service_scheduling','035_structured_checklists','036_checklist_groups'])await db.exec(readFileSync(new URL('../sql/'+name+'.sql',import.meta.url),'utf8'));
  await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,present boolean);
   INSERT INTO m8_equipment_catalog VALUES(7,true),(8,true);
   CREATE TABLE m8_order_equipment_links(equipment_id bigint,company_id integer,order_id bigint,stale boolean);
   INSERT INTO m8_order_equipment_links VALUES(7,1,100,false);
   CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,payload jsonb);
   INSERT INTO web_user_access(email,display_name,job_title,role,updated_by) VALUES('tech','Técnico','Técnico','user','test'),('outsider','Outro','Técnico','user','test');`);
  await db.exec(readFileSync(new URL('../sql/007_equipment_preventive.sql',import.meta.url),'utf8'));
  const schedule=(await db.query<any>("INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'admin') RETURNING *")).rows[0];
  let op=(await db.query<any>("INSERT INTO web_service_operations(id,schedule_id,position,document,updated_by) VALUES($1,$2,1,$3,'admin') RETURNING *",[randomUUID(),schedule.id,JSON.stringify({responsible:'tech',support:[],checklistId:'ccp'})])).rows[0];
  const config={checklists:[structuredClone(ccp)]};const stage=ccp.stages[0];
  async function act(action:string,extra:any={},email='tech',admin=false){
   await db.exec('BEGIN');try{const result=await updateChecklist(db,{action,stageId:stage.id,...extra},op,schedule,config,email,admin);await db.exec('COMMIT');op=result;return result;}catch(e){await db.exec('ROLLBACK');throw e;}
  }
  await assert.rejects(act('checklist_release'),/administradores/);
  await act('checklist_release',{},'admin',true);
  config.checklists[0].name='Novo nome';assert.equal(op.document.checklistRun.template.name,ccp.name);
  await assert.rejects(act('checklist_save',{answers:{}},'outsider'),/equipe atribuída/);
  const answer={[stage.fields[0].id]:1234};
  await assert.rejects(act('checklist_save',{answers:answer,equipmentId:'8',meterDate:'2026-09-28'}),/vinculado/);
  await act('checklist_save',{answers:answer,equipmentId:'7',meterDate:'2026-09-28'});
  assert.equal(op.status,'executing');
  assert.equal((await db.query('SELECT * FROM web_equipment_settings')).rows.length,0);
  await act('checklist_save',{answers:{[stage.fields[0].id]:1233},equipmentId:'7',meterDate:'2026-09-28'});
  await act('checklist_submit',{answers:answer,equipmentId:'7',meterDate:'2026-09-28'});
  assert.equal(op.document.checklistRun.stages[stage.id].status,'submitted');
  await assert.rejects(act('checklist_save',{answers:answer,equipmentId:'7',meterDate:'2026-09-28'}),/liberada/);
  await act('checklist_reopen',{},'admin',true);
  assert.equal((await db.query('SELECT * FROM web_equipment_events')).rows.length,0);
  const photos=ccp.stages[4], photo=photos.fields[0];await act('checklist_release',{stageId:photos.id},'admin',true);
  const buffer=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
  const file=new File([new Uint8Array(buffer)],'photo.png',{type:'image/png'});
  await assert.rejects(saveChecklistPhoto(op.id,photos.id,photo.id,file,'outsider'));
  const uploaded=await saveChecklistPhoto(op.id,photos.id,photo.id,file,'tech');
  assert.equal((await getChecklistPhoto(uploaded.id,'tech')).mime,'image/jpeg');
  await assert.rejects(getChecklistPhoto(uploaded.id,'outsider'));
  await assert.rejects(act('checklist_save',{stageId:photos.id,answers:{[photo.id]:['999']}}),/Foto não pertence/);
  await act('checklist_save',{stageId:photos.id,answers:{[photo.id]:[uploaded.id]}});
  await assert.rejects(act('checklist_submit',{stageId:photos.id,answers:{[photo.id]:[uploaded.id]}}),/Identificação/);
  assert.equal((await db.query('SELECT * FROM web_equipment_settings')).rows.length,0);
 }finally{g.historyPool=old;await db.close();}
});

test('groups, configurable photo limits, signatures and report visibility preserve internal answers',async()=>{
 const fields=[{id:'f1',label:'Inspeção',type:'flag',required:true,maxPhotos:2,comment:true,internalNote:true,report:true},{id:'f2',label:'Campo privado',type:'text',required:false,report:false},{id:'f3',label:'Assinatura',type:'signature',required:true,report:true}];
 const stage={id:'s1',name:'Etapa',fields:[],groups:[{id:'g1',name:'Grupo',fields}]};
 const template=validateChecklists([{id:'t',name:'Teste',items:[],stages:[stage]}])[0];
 assert.equal(stagesOf(template)[0].fields.length,3);
 assert.throws(()=>validateAnswers(stage,{f1:'OK',f3:['1','2']},true),/Anexos/);
 assert.throws(()=>validateFieldDetails(stage,{f1:{photos:['1','2','3']}}),/Limite/);
 assert.throws(()=>validateFieldDetails(stage,{f2:{comment:'Não permitido'}}),/não permitido/);
 const details=validateFieldDetails(stage,{f1:{photos:['1','2'],comment:'Comentário público',internalNote:'Segredo interno'}});
 const run={template,stages:{s1:{status:'submitted',answers:{f1:'OK',f2:'Resposta oculta',f3:['3']},details}}};
 const report=checklistReport(run);
 assert.equal(report[0].groups[0].fields.length,2);
 assert.ok(!JSON.stringify(report).includes('Segredo interno'));
 assert.ok(!JSON.stringify(report).includes('Resposta oculta'));
 assert.ok(!JSON.stringify(report).includes('Campo privado'));
 assert.ok(JSON.stringify(report).includes('Comentário público'));
 const jpg=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).jpeg().toBuffer();
 const bytes=await renderChecklistPdf({title:'Checklist',order:'1',client:'Cliente',equipment:'Compressor',position:1,report,photos:[{id:'3',content:jpg}]});
 assert.ok((await PDFDocument.load(bytes)).getPageCount()>0);
});

test('status indicators use configured options and retain legacy OK/NOK/NA',()=>{
 const stage={id:'s',name:'Status',fields:[{id:'f',label:'Resultado',type:'flag',required:true,options:['Aprovado','Reprovado','Não avaliado']}]};
 const template={id:'t',name:'Customizado',items:[],stages:[stage]};
 assert.doesNotThrow(()=>validateChecklists([template]));
 assert.equal(validateAnswers(stage,{f:'Aprovado'},true).f,'Aprovado');
 assert.throws(()=>validateAnswers(stage,{f:'OK'},true),/indicador/);
 for(const options of [[],['OK','OK'],['']])assert.throws(()=>validateChecklists([{...template,stages:[{...stage,fields:[{...stage.fields[0],options}]}]}]),/opções/);
 const legacy={...stage,fields:[{...stage.fields[0],options:undefined}]};
 assert.equal(validateAnswers(legacy,{f:'NOK'},true).f,'NOK');
});

test('CCP mirrors direct inspections and does not invent General groups or duplicate comments',()=>{
 const inspection=stagesOf(ccp)[1];
 assert.equal(inspection.fields.length,7);
 assert.ok(inspection.fields.every(f=>f.type==='flag'&&f.comment));
 assert.ok(inspection.groups!.every(g=>g.direct));
 assert.ok(stagesOf(ccp).every(s=>s.groups!.every(g=>g.name!=='Geral')));
 assert.doesNotThrow(()=>validateChecklists([ccp]));
 assert.deepEqual(repairCcpStructure(ccp),ccp);
 const legacy:any={id:'ccp',name:'CCP',items:[],stages:[{id:'ccp-stage-2',name:'Inspeções',fields:[],groups:[{id:'ccp-stage-2-group-1',name:'Geral',fields:[{id:'a',label:'Verificar',type:'flag',required:false},{id:'b',label:'Comentário — Verificar',type:'textarea',required:false}]}]}]};
 const fixed=repairCcpStructure(legacy);
 assert.equal(fixed.stages![0].groups![0].name,'');
 assert.equal(fixed.stages![0].fields.length,1);
 assert.equal(legacy.stages[0].groups[0].name,'Geral');
 legacy.stages[0].groups[0].name='Inspeções personalizadas';
 assert.equal(repairCcpStructure(legacy).stages![0].groups![0].name,'Inspeções personalizadas');
});

test('preventive intervals require one valid configuration per attendance type',()=>{
 assert.deepEqual(validatePreventiveTypes(undefined),[]);
 assert.deepEqual(validatePreventiveTypes([{m8Identifier:'Preventiva',hours:'2000',months:''}]),[{m8Identifier:'Preventiva',hours:2000,months:null}]);
 for(const rows of [[{m8Identifier:'A',hours:null,months:null}],[{m8Identifier:'A',hours:-1}],[{m8Identifier:'A',months:1.5}],[{m8Identifier:'A',months:1},{m8Identifier:'A',months:2}]])assert.throws(()=>validatePreventiveTypes(rows));
});

test('review applies meter and mapped preventive atomically, creates once, preserves newer readings and plan intervals',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,present boolean);
   INSERT INTO m8_equipment_catalog VALUES(7,true),(8,true);
   CREATE TABLE m8_order_equipment_links(equipment_id bigint,company_id integer,order_id bigint,stale boolean);
   INSERT INTO m8_order_equipment_links VALUES(7,1,100,false);
   CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,payload jsonb);
   INSERT INTO m8_ordens_servico VALUES(1,100,14877,'{"produtoEquipamentoId":"7"}');
   CREATE TABLE web_user_access(email text,display_name text);`);
  await db.exec(readFileSync(new URL('../sql/007_equipment_preventive.sql',import.meta.url),'utf8'));
  const stage={id:'meter',name:'Leitura',fields:[{id:'hours',label:'Horímetro',type:'meter',required:true}]};
  let op:any={id:randomUUID(),position:1,document:{checklistRun:{template:{id:'test',name:'Teste',m8Identifier:'Preventiva 2000',items:[],stages:[stage]},equipmentId:'7',meterDate:'2026-09-27',stages:{meter:{status:'submitted',answers:{hours:2000}}}}}};
  const schedule={company_id:1,order_id:100};const settings={preventiveTypes:[{m8Identifier:'Preventiva 2000',hours:2000,months:6}]};
  async function review(operation=op,config:any=settings){await db.exec('BEGIN');try{const doc=await reviewChecklist(db,operation,schedule,config,'admin');await db.exec('COMMIT');return doc;}catch(e){await db.exec('ROLLBACK');throw e;}}
  const incomplete=structuredClone(op);incomplete.document.checklistRun.stages.meter.status='released';await assert.rejects(review(incomplete),/Devolva/);
  const wrong=structuredClone(op);wrong.document.checklistRun.equipmentId='8';await assert.rejects(review(wrong),/vinculado/);
  // A stale index must not block review when the OS still explicitly names this equipment.
  await db.exec('UPDATE m8_order_equipment_links SET stale=true');
  await assert.rejects(review(wrong),/vinculado/);
  const doc=await review();
  assert.equal(doc.checklistRun.reviewApplied.meterUpdated,true);
  const audit=(await db.query<any>("SELECT document FROM web_equipment_events WHERE kind='settings' ORDER BY id LIMIT 1")).rows[0].document;
  assert.equal(audit.source,'checklist_review');
  assert.equal(Number(audit.orderNumber),14877);
  assert.equal(audit.operationPosition,1);
  assert.equal(audit.after.meter,2000);

  const plans=await db.query<any>('SELECT * FROM web_equipment_plans');assert.equal(plans.rows.length,1);
  assert.equal(plans.rows[0].document.m8Identifier,'Preventiva 2000');assert.equal(plans.rows[0].document.lastMeter,2000);assert.equal(plans.rows[0].document.lastDate,'2026-09-27');assert.equal(plans.rows[0].document.lastOrder,'100');
  const count=(await db.query('SELECT * FROM web_equipment_events')).rows.length;
  await review({...op,document:doc});assert.equal((await db.query('SELECT * FROM web_equipment_events')).rows.length,count);
  op=structuredClone(op);op.document.checklistRun.meterDate='2026-09-28';op.document.checklistRun.stages.meter.answers.hours=4000;
  await review(op,{preventiveTypes:[{m8Identifier:'Preventiva 2000',hours:8000,months:24}]});
  let plan=(await db.query<any>('SELECT * FROM web_equipment_plans')).rows[0];assert.equal(plan.document.hours,2000);assert.equal(plan.document.months,6);assert.equal(plan.document.lastMeter,4000);assert.equal(plan.version,2);
  op.document.checklistRun.meterDate='2026-09-27';op.document.checklistRun.stages.meter.answers.hours=2500;
  const older=await review();assert.equal(older.checklistRun.reviewApplied.meterUpdated,false);assert.equal(older.checklistRun.reviewApplied.preventiveUpdated,false);
  assert.equal((await db.query<any>('SELECT document FROM web_equipment_settings')).rows[0].document.meter,4000);
  op.document.checklistRun.meterDate='2026-09-28';op.document.checklistRun.stages.meter.answers.hours=3999;await assert.rejects(review(),/diminuir/);
  // Ambiguous mappings abort the entire review, including its earlier meter update.
  await db.query('INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES($1,7,$2,$3)',[randomUUID(),JSON.stringify(plan.document),'admin']);
  op.document.checklistRun.stages.meter.answers.hours=5000;await assert.rejects(review(),/Mais de uma preventiva/);
  assert.equal((await db.query<any>('SELECT document FROM web_equipment_settings')).rows[0].document.meter,4000);
  // Corrective types without a configured interval update the meter without inventing a maintenance cycle.
  op.document.checklistRun.template.m8Identifier='Corretiva';await review();assert.equal((await db.query('SELECT * FROM web_equipment_plans')).rows.length,2);
 }finally{await db.close();}
});
test('planner corrections retain submission and review status, enforce required answers and audit changes',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  for(const name of ['008_administration','009_employees','028_service_scheduling','035_structured_checklists'])await db.exec(readFileSync(new URL('../sql/'+name+'.sql',import.meta.url),'utf8'));
  const schedule=(await db.query<any>("INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'admin') RETURNING *")).rows[0];
  const template={id:'check',name:'Teste',stages:[{id:'s',name:'Inspeção',fields:[{id:'f',label:'Condição',type:'flag',required:true,options:['OK','NOK','NA']}]}]};
  const submission={at:'2026-09-30T10:00:00Z',by:'tech'};
  let op=(await db.query<any>("INSERT INTO web_service_operations(id,schedule_id,position,document,status,updated_by) VALUES($1,$2,1,$3,'awaiting_review','tech') RETURNING *",[randomUUID(),schedule.id,JSON.stringify({responsible:'tech',support:[],checklistId:'check',checklistRun:{template,submission,stages:{s:{status:'submitted',answers:{f:'OK'}}}}})])).rows[0];
  const payload={action:'checklist_review_save',stageId:'s',answers:{f:'NOK'}};
  await assert.rejects(updateChecklist(db,payload,op,schedule,{},'tech',false),/planejador/);
  await assert.rejects(updateChecklist(db,{...payload,answers:{}},op,schedule,{},'admin',true),/Condição/);
  const saved=await updateChecklist(db,payload,op,schedule,{},'admin',true);
  assert.equal(saved.status,'awaiting_review');assert.equal(saved.document.checklistRun.stages.s.status,'submitted');
  assert.equal(saved.document.checklistRun.stages.s.answers.f,'NOK');
  assert.deepEqual(saved.document.checklistRun.submission,submission);
  assert.equal(saved.document.checklistRun.reviewCorrectedBy,'admin');
  const event=(await db.query<any>("SELECT details FROM web_access_events WHERE event='checklist_review_save'")).rows[0].details;
  assert.equal(event.before.answers.f,'OK');assert.equal(event.after.answers.f,'NOK');
  await assert.rejects(updateChecklist(db,payload,{...saved,status:'reviewed'},schedule,{},'admin',true),/revisão/);
 }finally{await db.close();}
});
