import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {reviewChecklist} from '../lib/service-scheduling/checklist-review';
test('review uses the latest collection instead of contradictory imported interventions and preserves all controls for historical reports',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,present boolean);INSERT INTO m8_equipment_catalog VALUES(7,true);
 CREATE TABLE m8_order_equipment_links(equipment_id bigint,company_id int,order_id bigint,stale boolean);INSERT INTO m8_order_equipment_links VALUES(7,1,100,false);
 CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,payload jsonb);INSERT INTO m8_ordens_servico VALUES(1,100,14807,'{"produtoEquipamentoId":"7"}');CREATE TABLE web_user_access(email text,display_name text);`);
 await db.exec(readFileSync('sql/007_equipment_preventive.sql','utf8'));
 await db.query("INSERT INTO web_equipment_settings(equipment_id,document,updated_by) VALUES(7,$1,'admin')",[JSON.stringify({meter:1563,meterDate:'2026-09-08'})]);
 const planId=randomUUID();await db.query("INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES($1,7,$2,'admin')",[planId,JSON.stringify({name:'Importada 24000',m8Identifier:'Outra',hours:24000,lastDate:'2023-09-10',lastMeter:29904})]);
 function operation(meter:number,date:string){return {id:randomUUID(),position:1,document:{equipmentId:'7',checklistRun:{equipmentId:'7',meterDate:date,template:{id:'t',name:'T',m8Identifier:'Preventiva 8000',items:[],stages:[{id:'s',name:'S',fields:[{id:'m',label:'Horímetro Total',type:'meter'}]}]},stages:{s:{status:'submitted',answers:{m:meter}}}}}};}
 const review=(meter:number,date:string,confirmation?:any)=>reviewChecklist(db,operation(meter,date),{company_id:1,order_id:100},{preventiveTypes:[{m8Identifier:'Preventiva 8000',hours:8000,months:24}]},'admin',confirmation);
 const current=await review(1611,'2026-11-12');assert.equal(current.checklistRun.reviewApplied.meterUpdated,true);assert.equal(current.checklistRun.reviewApplied.inconsistentInterventions[0].meter,29904);
 assert.equal((await db.query<any>('SELECT document FROM web_equipment_settings')).rows[0].document.meter,1611);
 assert.equal((await db.query<any>('SELECT document FROM web_equipment_plans WHERE id=$1',[planId])).rows[0].document.lastMeter,29904);
 const before=await db.query('SELECT * FROM web_equipment_settings');const plans=await db.query('SELECT * FROM web_equipment_plans ORDER BY id');const events=await db.query('SELECT * FROM web_equipment_events ORDER BY id');
 const historical=await review(1500,'2026-08-30');assert.equal(historical.checklistRun.reviewApplied.reason,'historical_reading');assert.equal(historical.checklistRun.reviewApplied.meterUpdated,false);assert.equal(historical.checklistRun.reviewApplied.preventiveUpdated,false);
 assert.deepEqual((await db.query('SELECT * FROM web_equipment_settings')).rows,before.rows);assert.deepEqual((await db.query('SELECT * FROM web_equipment_plans ORDER BY id')).rows,plans.rows);assert.deepEqual((await db.query('SELECT * FROM web_equipment_events ORDER BY id')).rows,events.rows);
 await assert.rejects(review(1600,'2026-11-12'),/diminuir/);await assert.rejects(review(1600,'2026-11-13'),/diminuir/);
 await db.query("UPDATE web_equipment_plans SET document=document||$2::jsonb WHERE id=$1",[planId,JSON.stringify({lastDate:'2026-11-13',lastMeter:2000})]);
 await assert.rejects(review(1700,'2026-11-14'),/Importada 24000.*2000/);
 const confirmation={equipmentId:'7',meter:1600,meterDate:'2026-11-13',previousMeter:1611,previousMeterDate:'2026-11-12'};
 await assert.rejects(review(1600,'2026-11-13',{...confirmation,previousMeter:1610}),/mudou/);
 const confirmed=await review(1600,'2026-11-13',confirmation);
 assert.equal(confirmed.checklistRun.reviewApplied.meterUpdated,true);assert.equal(confirmed.checklistRun.reviewApplied.preventiveUpdated,true);
 assert.equal(confirmed.checklistRun.reviewApplied.meterConfirmation.by,'admin');
 assert.equal((await db.query<any>('SELECT document FROM web_equipment_settings')).rows[0].document.meter,1600);
 assert.equal((await db.query<any>("SELECT document FROM web_equipment_plans WHERE document->>'m8Identifier'='Preventiva 8000'")).rows[0].document.lastMeter,1600);
 const audit=(await db.query<any>("SELECT document FROM web_equipment_events WHERE document ? 'meterConfirmation' AND kind='settings'")).rows[0].document;
 assert.equal(audit.meterConfirmation.before.meter,1611);assert.equal(audit.meterConfirmation.after.meter,1600);
 await assert.rejects(review(1500,'2026-08-30',{equipmentId:'7',meter:1500,meterDate:'2026-08-30',previousMeter:1600,previousMeterDate:'2026-11-13'}),/histórica/);

 }finally{await db.close();}
});
