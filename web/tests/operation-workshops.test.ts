import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {attachOperationWorkshops} from '../lib/service-scheduling/operation-workshops';
test('calendar workshop status follows each operation equipment and excludes closed or reconciled stays',async()=>{
 const db=new PGlite(),g=globalThis as any,previous=g.historyPool;g.historyPool={query:db.query.bind(db)};
 try{
  await db.exec(`CREATE TABLE web_workshops(id int,name text);CREATE TABLE web_workshop_visits(id int,equipment_id bigint,workshop_id int,entered_at timestamptz,exited_at timestamptz,reconciled_out_at timestamptz);
   INSERT INTO web_workshops VALUES(1,'Rio do Sul'),(2,'Lages');
   INSERT INTO web_workshop_visits VALUES(1,10,1,now(),NULL,NULL),(2,20,2,now(),now(),NULL),(3,30,2,now(),NULL,now()),(4,40,2,now(),NULL,NULL);`);
  await db.exec("ALTER TABLE web_workshop_visits ADD COLUMN source jsonb DEFAULT '{}'");
  const schedules:any[]=[{equipment_id:'10',calendar_operations:[{equipmentId:'10'},{equipmentId:'20'},{equipmentId:'30'},{equipmentId:'40'},{}, {equipmentId:'invalid'}]}];
  await attachOperationWorkshops(schedules);
  const ops=schedules[0].calendar_operations;
  assert.equal(ops[0].workshop.name,'Rio do Sul');assert.equal(ops[1].workshop,null);assert.equal(ops[2].workshop,null);assert.equal(ops[3].workshop.name,'Lages');assert.equal(ops[4].workshop.name,'Rio do Sul');assert.equal(ops[5].workshop,null);
 }finally{g.historyPool=previous;await db.close();}
});
