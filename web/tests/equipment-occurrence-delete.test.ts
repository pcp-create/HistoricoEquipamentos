import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createOccurrence,deleteOccurrence,occurrencesForEquipment} from '../lib/equipment-occurrences/store';
import {Forbidden} from '../lib/auth';
test('only enabled administrators delete B.O; audit retains full record and deletion rolls back on audit failure',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,name text,serial text,present boolean);CREATE TABLE web_user_access(email text PRIMARY KEY,display_name text,role text,enabled boolean);CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);INSERT INTO m8_equipment_catalog VALUES(100,'Compressor A','A001',true);INSERT INTO web_user_access VALUES('admin','Administrador','admin',true),('user','Usuário','user',true),('manager','Gestor','manager',true),('disabled','Inativo','admin',false);`);
 await db.exec(readFileSync(new URL('../sql/094_equipment_occurrences.sql',import.meta.url),'utf8'));
 const input={equipmentId:'100',occurredOn:'2026-11-03',title:'Ocorrência de teste',description:'Descrição completa preservada na auditoria.'};
 const a=await createOccurrence(db,input,'user'),b=await createOccurrence(db,{...input,title:'Outro B.O'},'user');
 for(const actor of ['user','manager','disabled'])await assert.rejects(()=>deleteOccurrence(db,a.id,actor),Forbidden);
 assert.equal((await occurrencesForEquipment(db,['100'])).length,2);
 await db.query('BEGIN');await deleteOccurrence(db,a.id,'admin');await db.query('COMMIT');
 assert.deepEqual((await occurrencesForEquipment(db,['100'])).map((x:any)=>x.id),[b.id]);
 const audit:any=(await db.query("SELECT * FROM web_access_events WHERE event='equipment_occurrence_deleted'")).rows[0];assert.equal(audit.actor,'admin');assert.equal(audit.details.occurrenceId,a.id);assert.equal(audit.details.before.description,input.description);assert.equal(audit.details.before.created_by,'user');
 await assert.rejects(()=>deleteOccurrence(db,a.id,'admin'),/não encontrado/);
 await db.exec('DROP TABLE web_access_events');await db.query('BEGIN');await assert.rejects(()=>deleteOccurrence(db,b.id,'admin'));await db.query('ROLLBACK');
 assert.equal((await occurrencesForEquipment(db,['100']))[0].id,b.id);
 }finally{await db.close();}
});
