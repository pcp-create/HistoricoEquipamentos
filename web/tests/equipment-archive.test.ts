import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {saveEquipment} from '../lib/equipment-management/store.preview';
test('archiving and restoring preserve plan data, versions and audit, rejecting duplicate active identifiers',async()=>{
 const db=new PGlite(),g=globalThis as any,previous=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 const equipment='100',id='12345678-1234-4234-8234-123456789abc',user={email:'test@example.com',name:'Teste'} as any;
 try{
  await db.exec('CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,payload jsonb);INSERT INTO m8_equipment_catalog VALUES(100,\'{}\');');
  await db.exec(readFileSync('sql/007_equipment_preventive.sql','utf8'));
  const document={name:'Plano teste',m8Identifier:'ABC',lastOrder:'999',lastDate:'2025-01-01',lastMeter:100};
  await db.query('INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES($1,$2,$3,$4)',[id,equipment,JSON.stringify(document),user.email]);
  await saveEquipment({action:'archive',equipment,id,version:1},user);
  let row=(await db.query<any>('SELECT * FROM web_equipment_plans WHERE id=$1',[id])).rows[0];
  assert.equal(row.archived,true);assert.equal(row.version,2);assert.deepEqual(row.document,document);
  await assert.rejects(saveEquipment({action:'restore',equipment,id,version:1},user),/alterado/);
  await db.query("INSERT INTO web_equipment_plans(id,equipment_id,document,updated_by) VALUES('22345678-1234-4234-8234-123456789abc',100,$1,'test')",[JSON.stringify(document)]);
  await assert.rejects(saveEquipment({action:'restore',equipment,id,version:2},user),/preventiva ativa/);
  await db.exec("DELETE FROM web_equipment_plans WHERE id='22345678-1234-4234-8234-123456789abc'");
  await saveEquipment({action:'restore',equipment,id,version:2},user);
  row=(await db.query<any>('SELECT * FROM web_equipment_plans WHERE id=$1',[id])).rows[0];
  assert.equal(row.archived,false);assert.equal(row.version,3);assert.deepEqual(row.document,document);
  const events=(await db.query<any>('SELECT * FROM web_equipment_events ORDER BY id')).rows;
  assert.deepEqual(events.map(e=>[e.kind,e.document.action||null]),[['archive',null],['plan','restore']]);
  await assert.rejects(saveEquipment({action:'restore',equipment,id,version:3},user),/não encontrado/);
 }finally{g.historyPool=previous;await db.close();}
});
