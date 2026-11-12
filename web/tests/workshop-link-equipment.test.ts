import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {workshopMutate,workshopSearch} from '../lib/workshop/store';
test('link imported workshop entry to active equipment preserving original entry and audit and rejecting duplicates',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(s:string,a?:any[])=>db.query(s.replace('BEGIN READ WRITE','BEGIN'),a);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,present boolean,name text,serial text,model text);
 INSERT INTO m8_equipment_catalog VALUES(17431,true,'Compressor CPVR30','BQD0118788','CPVR30'),(21930,true,'Duplicado','BQD0118788','CPVR30'),(999,true,'Em oficina','999','');
 CREATE TABLE web_equipment_settings(equipment_id bigint,document jsonb);
 INSERT INTO web_equipment_settings VALUES(21930,'{"inactivation":{"reason":"Duplicado"}}');
 CREATE TABLE m8_person_equipment(company_id int,person_id bigint,equipment_id bigint,present boolean,payload jsonb,collected_at timestamptz DEFAULT now());
 INSERT INTO m8_person_equipment(company_id,person_id,equipment_id,present,payload) VALUES(1,10,17431,true,'{"ativo":true}'),(1,10,21930,true,'{"ativo":false}'),(2,10,21930,true,'{"ativo":true}');
 CREATE VIEW web_effective_person_equipment AS SELECT equipment_id,present,'Cliente'::text person_name,false integration_pending FROM m8_person_equipment;`);
 for(const file of ['067_workshop','068_workshop_reconciliation','069_workshop_external_position','070_workshop_rental_stages'])await db.exec(readFileSync('sql/'+file+'.sql','utf8'));
 const id=randomUUID();await db.query("INSERT INTO web_workshop_visits(id,equipment_id,workshop_id,entered_at,stage,notes,source,created_by,updated_by) VALUES($1,NULL,2,'2026-09-29T03:00:00Z','repair','Anotação original','{\"customer\":\"BLUE FOREST\"}','import','import')",[id]);
 assert.deepEqual((await workshopSearch('BQD0118788',false,false,true)).map(r=>r.id),['17431']);
 await assert.rejects(workshopMutate({action:'link-equipment',id,version:1,equipmentId:21930},'user'),/ativo/);
 await assert.rejects(workshopMutate({action:'link-equipment',id,version:0,equipmentId:17431},'user'),/mudou/);
 await workshopMutate({action:'link-equipment',id,version:1,equipmentId:17431},'user');
 const visit=(await db.query<any>('SELECT * FROM web_workshop_visits WHERE id=$1',[id])).rows[0];
 assert.equal(visit.equipment_id,17431);assert.equal(visit.workshop_id,2);assert.equal(visit.stage,'repair');assert.equal(visit.notes,'Anotação original');assert.equal(visit.entered_at.toISOString(),'2026-09-29T03:00:00.000Z');assert.equal(visit.source.customer,'BLUE FOREST');assert.equal(visit.version,2);
 const event=(await db.query<any>('SELECT * FROM web_workshop_events WHERE visit_id=$1',[id])).rows[0];assert.equal(event.action,'Equipamento vinculado ao cadastro');assert.equal(event.actor,'user');assert.equal(event.document.equipmentId,'17431');
 await assert.rejects(workshopMutate({action:'link-equipment',id,version:2,equipmentId:999},'user'),/já possui equipamento/);
 const other=randomUUID();await db.query("INSERT INTO web_workshop_visits(id,equipment_id,workshop_id,entered_at,created_by,updated_by) VALUES($1,NULL,2,now(),'import','import')",[other]);
 await assert.rejects(workshopMutate({action:'link-equipment',id:other,version:1,equipmentId:17431},'user'),/outra entrada/);
 assert.equal((await db.query<any>('SELECT equipment_id FROM web_workshop_visits WHERE id=$1',[other])).rows[0].equipment_id,null);
 // ERP-only inactivity also blocks linking when there is no local override.
 await db.exec("INSERT INTO m8_person_equipment(company_id,person_id,equipment_id,present,payload) VALUES(1,11,999,true,'{\"ativo\":false}')");
 await assert.rejects(workshopMutate({action:'link-equipment',id:other,version:1,equipmentId:999},'user'),/ativo/);
 }finally{g.historyPool=old;await db.close();}
});
