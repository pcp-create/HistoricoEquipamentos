import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {saveVisitRecords} from '../lib/visits/records';
test('visit records persist machine history and photos once, rejecting unrelated machines',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE web_sales_visits(id text,status text,customer_key text,completed_at text,machine_records jsonb DEFAULT '[]',photos jsonb DEFAULT '[]');INSERT INTO web_sales_visits(id,status,customer_key,completed_at) VALUES('v','completed','m8:1','2026-10-27');CREATE TABLE web_visit_photos(id text,visit_id text,content bytea);CREATE TABLE web_equipment_events(equipment_id text,kind text,document jsonb,created_by text,display_name text);CREATE TABLE web_user_access(email text,display_name text);`);
 await db.exec("CREATE TABLE web_visit_machine_registrations(id text,customer_key text,equipment_type text,model text);INSERT INTO web_visit_machine_registrations VALUES('new','m8:1','Compressor','GA22'),('other','m8:2','Compressor','GA11');");
 await db.exec("CREATE TABLE m8_person_equipment(person_id bigint,equipment_id bigint,present boolean);CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,model text,serial text);INSERT INTO m8_person_equipment VALUES(1,7,true);INSERT INTO m8_equipment_catalog VALUES(7,'Compressor','','');");
 const customers=[{key:'m8:1',equipment:[{id:'7',name:'Compressor'}]}];
 await assert.rejects(()=>saveVisitRecords(db,{id:'v',machineRecords:[{equipment:'8',note:'Nota'}]},'a@test',customers));
 const photo='data:image/jpeg;base64,'+(await sharp({create:{width:2,height:2,channels:3,background:'white'}}).jpeg().toBuffer()).toString('base64');
 const body={id:'v',machineRecords:[{equipment:'7',note:'Observação da visita',meter:'1234.5',meterDate:'2026-01-15'}],photos:[photo]};
 await saveVisitRecords(db,body,'a@test',customers);await saveVisitRecords(db,body,'a@test',customers);
 assert.equal((await db.query('SELECT * FROM web_visit_photos')).rows.length,1);
 const events=(await db.query<any>('SELECT * FROM web_equipment_events')).rows;assert.equal(events.length,1);assert.equal(events[0].document.note,'Observação da visita');assert.equal(events[0].equipment_id,'7');assert.equal(events[0].document.meter,1234.5);assert.equal(events[0].document.meterDate,'2026-01-15');
 await db.exec("INSERT INTO web_sales_visits(id,status,customer_key,completed_at) VALUES('v2','completed','m8:1','2026-10-27')");
 await assert.rejects(()=>saveVisitRecords(db,{id:'v2',machineRecords:[{equipment:'pending:other',note:'Inválida'}]},'a@test',customers));
 await assert.rejects(()=>saveVisitRecords(db,{id:'v2',machineRecords:[{equipment:'pending:new',note:'Leitura inválida',meter:'-1',meterDate:'2026-01-15'}]},'a@test',customers));
 await saveVisitRecords(db,{id:'v2',machineRecords:[{equipment:'pending:new',note:'Registro da máquina nova'}]},'a@test',customers);
 const saved=(await db.query<any>("SELECT machine_records FROM web_sales_visits WHERE id='v2'")).rows[0];assert.equal(saved.machine_records[0].equipment,'pending:new');assert.equal(saved.machine_records[0].name,'Compressor - GA22');
 assert.equal((await db.query('SELECT * FROM web_equipment_events')).rows.length,1);
 }finally{await db.close();}
});
