import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {workshopMutate} from '../lib/workshop/store';
import {workshopStageTime} from '../lib/workshop/stage-time';
import {equipmentWorkshopStatus} from '../lib/workshop/equipment-status';
import {workshopEvolution} from '../lib/workshop/movements';
test('workshop transfers atomically close the origin and open the destination, preserving context and paired audit',async()=>{
 const db=new PGlite(),g=globalThis as any,previous=g.historyPool;let failTransfer=false;
 const query=(sql:string,args?:any[])=>{if(failTransfer&&sql.includes("'Entrada por transferência'"))throw Error('Simulated audit failure');return db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);};
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE m8_equipment_catalog(equipment_id bigint,present boolean);INSERT INTO m8_equipment_catalog VALUES(100,true);');
  for(const file of ['067_workshop','068_workshop_reconciliation','069_workshop_external_position','070_workshop_rental_stages','088_workshop_equipment_registrations'])await db.exec(readFileSync('sql/'+file+'.sql','utf8'));
  await workshopMutate({action:'entry',equipmentId:'100',workshopId:'1',enteredAt:'2025-01-01T12:00:00Z',expectedAt:'2025-01-15',notes:'Condição inicial'},'user');
  let origin=(await db.query<any>('SELECT * FROM web_workshop_visits')).rows[0];
  await db.query("UPDATE web_workshop_visits SET stage='repair',source=$2 WHERE id=$1",[origin.id,JSON.stringify({sheet:'Equipamentos Locação em revisão',customer:'Cliente'})]);
  await db.query('INSERT INTO web_workshop_quotes VALUES($1,2,999)',[origin.id]);
  const transfer={action:'transfer',id:origin.id,version:1,workshopId:'2',departedAt:'2025-01-05T12:00:00Z',arrivedAt:'2025-01-05T15:00:00Z',notes:'Revisão na Serrana'};
  for(const [patch,pattern] of [[{workshopId:'1'},/diferente/],[{workshopId:'999'},/ativa/],[{version:0},/mudou/],[{departedAt:'2024-12-31T12:00:00Z'},/anterior à entrada/],[{arrivedAt:'2025-01-05T11:00:00Z'},/anterior à saída/],[{arrivedAt:new Date(Date.now()+86400000).toISOString()},/futuro/]] as const)await assert.rejects(workshopMutate({...transfer,...patch},'user'),pattern);
  await db.exec('UPDATE web_workshops SET active=false WHERE id=3');await assert.rejects(workshopMutate({...transfer,workshopId:'3'},'user'),/ativa/);
  const external=randomUUID();await db.query("INSERT INTO web_workshop_external(id,visit_id,component,supplier,sent_at,created_by) VALUES($1,$2,'Motor','Fornecedor','2025-01-02T12:00:00Z','user')",[external,origin.id]);
  await assert.rejects(workshopMutate(transfer,'user'),/retorno dos componentes/);await db.query("UPDATE web_workshop_external SET returned_at='2025-01-04T12:00:00Z' WHERE id=$1",[external]);
  const result=await workshopMutate(transfer,'user');assert.ok(result.transferVisitId);assert.notEqual(result.transferVisitId,origin.id);
  const visits=(await db.query<any>('SELECT * FROM web_workshop_visits ORDER BY entered_at')).rows;origin=visits[0];const destination=visits[1];
  assert.equal(origin.exited_at.toISOString(),transfer.departedAt.replace('Z','.000Z'));assert.equal(destination.entered_at.toISOString(),transfer.arrivedAt.replace('Z','.000Z'));assert.equal(destination.workshop_id,2);assert.equal(destination.equipment_id,100);assert.equal(destination.stage,'repair');assert.equal(destination.notes,'Condição inicial');assert.equal(destination.expected_at.toISOString().slice(0,10),'2025-01-15');
  assert.equal(destination.source.sheet,'Equipamentos Locação em revisão');assert.equal(destination.source.transfer_from.fromVisitId,origin.id);assert.equal(origin.source.transfer_to.toVisitId,destination.id);
  assert.equal((await db.query('SELECT * FROM web_workshop_quotes WHERE visit_id=$1',[destination.id])).rows.length,1);
  const events=(await db.query<any>("SELECT * FROM web_workshop_events WHERE action LIKE '%transferência' ORDER BY id")).rows;assert.equal(events.length,2);
  for(const event of events){assert.equal(event.actor,'user');assert.equal(event.document.fromWorkshop,'RJ Compressores');assert.equal(event.document.toWorkshop,'RJ Serrana');assert.equal(event.document.departedAt,'2025-01-05T12:00:00.000Z');assert.equal(event.document.arrivedAt,'2025-01-05T15:00:00.000Z');assert.equal(event.document.notes,transfer.notes);}
  const entryEvent=events.find(e=>e.visit_id===destination.id);assert.equal(entryEvent.document.nextStage,'repair');
  const timing=workshopStageTime({...destination,entered_at:destination.entered_at.toISOString(),events:[{...entryEvent,created_at:entryEvent.created_at.toISOString()}]},Date.parse('2025-01-06T15:00:00Z'));assert.equal(timing.currentMs,86400000);
  assert.equal((await equipmentWorkshopStatus(['100'])).get('100')?.workshop,'RJ Serrana');
  await assert.rejects(workshopMutate(transfer,'user'),/mudou/);
  const moves=workshopEvolution(visits.map(v=>({...v,entered_at:v.entered_at.toISOString(),exited_at:v.exited_at?.toISOString()})),'2025-01-01','2025-01-06','day');assert.equal(moves.reduce((sum,v)=>sum+v.entries,0),2);assert.equal(moves.reduce((sum,v)=>sum+v.exits,0),1);assert.equal(moves.at(-1)?.occupancy,1);
  failTransfer=true;
  await assert.rejects(workshopMutate({...transfer,id:destination.id,version:1,workshopId:'1',departedAt:'2025-01-10T12:00:00Z',arrivedAt:'2025-01-10T15:00:00Z'},'user'),/Simulated/);
  assert.equal((await db.query('SELECT * FROM web_workshop_visits')).rows.length,2);assert.equal((await db.query<any>('SELECT exited_at FROM web_workshop_visits WHERE id=$1',[destination.id])).rows[0].exited_at,null);
 }finally{g.historyPool=previous;await db.close();}
});
