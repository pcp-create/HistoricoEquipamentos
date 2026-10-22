import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {workshopMutate} from '../lib/workshop/store';import {effectiveStage,daysInWorkshop} from '../lib/workshop/model';
test('workshop computes elapsed days and follows explicit OS material shortages',()=>{assert.equal(effectiveStage('repair',[{status_lancamento_nome:'22 - O.S FALTANDO PEÇAS'}]),'parts');assert.equal(effectiveStage('repair',[]),'repair');assert.equal(daysInWorkshop('2026-10-20T12:00:00Z','2026-10-22T12:00:00Z'),2);});
test('entries prevent duplicates; external parts block exit; version conflicts and history are preserved',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;CREATE TABLE m8_equipment_catalog(equipment_id bigint,present boolean);INSERT INTO m8_equipment_catalog VALUES(100,true);');
  await db.exec(readFileSync(new URL('../sql/067_workshop.sql',import.meta.url),'utf8'));
  const entry={action:'entry',equipmentId:'100',workshopId:'1',enteredAt:'2025-01-01T12:00:00Z',notes:'Entrada'};
  await workshopMutate(entry,'planner');await assert.rejects(()=>workshopMutate(entry,'planner'),/já possui/);
  let v=(await db.query<any>('SELECT * FROM web_workshop_visits')).rows[0];
  await workshopMutate({action:'external',id:v.id,version:1,component:'Motor',supplier:'Prestador'},'planner');
  await assert.rejects(()=>workshopMutate({action:'stage',id:v.id,version:1,stage:'ready'},'planner'),/mudou/);
  await assert.rejects(()=>workshopMutate({action:'exit',id:v.id,version:2},'planner'),/retorno/);
  await assert.rejects(()=>workshopMutate({action:'workshop',id:'1',active:false,name:'Oficina'},'planner'),/saída/);
  const external=(await db.query<any>('SELECT * FROM web_workshop_external')).rows[0];
  await workshopMutate({action:'return',id:v.id,version:2,externalId:external.id},'planner');
  await workshopMutate({action:'exit',id:v.id,version:3,notes:'Entregue'},'planner');
  v=(await db.query<any>('SELECT * FROM web_workshop_visits')).rows[0];assert.ok(v.exited_at);assert.equal(v.version,4);
  assert.equal((await db.query('SELECT * FROM web_workshop_events')).rows.length,4);
  await workshopMutate(entry,'planner');assert.equal((await db.query('SELECT * FROM web_workshop_visits')).rows.length,2);
 }finally{g.historyPool=old;await db.close();}
});
