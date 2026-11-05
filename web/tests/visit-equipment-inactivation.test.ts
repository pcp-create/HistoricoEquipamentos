import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {inactivateVisitEquipment,equipmentInactivations} from '../lib/visits/equipment-inactivation';
test('equipment inactivation requires justification and customer ownership, preserves ERP and is idempotent',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,enabled boolean,role text);INSERT INTO web_user_access VALUES('seller@test.com',true,'user'),('blocked@test.com',false,'user');CREATE TABLE m8_customer_directory(person_id bigint);INSERT INTO m8_customer_directory VALUES(1),(2);CREATE TABLE m8_person_equipment(person_id bigint,equipment_id bigint,present boolean);INSERT INTO m8_person_equipment VALUES(1,7,true);CREATE TABLE web_visit_machine_registrations(id uuid,customer_key text);CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);");
  await db.exec(readFileSync('sql/097_visit_equipment_inactivation.sql','utf8'));
  const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
  const input={customer:'m8:1',equipment:'7',reason:'Equipamento vendido'};
  await assert.rejects(()=>inactivateVisitEquipment({...input,reason:''},'seller@test.com'),/justificativa/);
  await assert.rejects(()=>inactivateVisitEquipment({...input,customer:'m8:2'},'seller@test.com'),/deste cliente/);
  await assert.rejects(()=>inactivateVisitEquipment(input,'blocked@test.com'));
  const result=await inactivateVisitEquipment(input,'seller@test.com');assert.equal(result.inactivation.reason,input.reason);
  await inactivateVisitEquipment({...input,reason:'Reenvio'},'seller@test.com');
  assert.equal((await equipmentInactivations(db)).length,1);assert.equal((await db.query('SELECT * FROM web_access_events')).rows.length,1);
  assert.equal((await db.query<any>('SELECT present FROM m8_person_equipment')).rows[0].present,true);
 }finally{g.historyPool=old;await db.close();}
});
