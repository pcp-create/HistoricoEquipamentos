import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
import {workshopMutate} from '../lib/workshop/store';import {equipmentWorkshopStatus} from '../lib/workshop/equipment-status';
test('component entries reuse the workshop lifecycle, preserve their machine link and enforce catalogue administration',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE m8_equipment_catalog(equipment_id bigint,present boolean);INSERT INTO m8_equipment_catalog VALUES(100,true);CREATE TABLE web_user_access(email text,role text,enabled boolean);INSERT INTO web_user_access VALUES('user','user',true),('admin','admin',true);CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);`);
 for(const file of ['067_workshop','068_workshop_reconciliation','069_workshop_external_position','070_workshop_rental_stages','088_workshop_equipment_registrations','099_workshop_components'])await db.exec(readFileSync(new URL('../sql/'+file+'.sql',import.meta.url),'utf8'));
 const add=await workshopMutate({action:'component_add',name:'Motor elétrico'},'user') as any;
 const type=add.component.id;
 await workshopMutate({action:'component_add',name:'motor elétrico'},'user');assert.equal((await db.query<any>('SELECT count(*) n FROM web_workshop_component_types')).rows[0].n,1);
 await assert.rejects(()=>workshopMutate({action:'component_update',componentId:type,version:1,name:'Outro'},'user'));
 await assert.rejects(()=>workshopMutate({action:'component_delete',componentId:type,version:1},'user'));
 const entry={action:'entry',entryKind:'component',componentId:type,equipmentId:'100',workshopId:'1',enteredAt:'2025-01-01T12:00:00Z',notes:'Somente o motor'};
 await assert.rejects(()=>workshopMutate({...entry,componentId:null},'user'));
 await workshopMutate(entry,'user');
 let visit=(await db.query<any>("SELECT * FROM web_workshop_visits WHERE source->>'entryKind'='component'")).rows[0];
 assert.equal(String(visit.equipment_id),'100');assert.equal(visit.source.componentName,'Motor elétrico');assert.equal((await equipmentWorkshopStatus(['100'])).size,0);
 await workshopMutate({...entry,entryKind:'equipment'},'user');assert.equal((await equipmentWorkshopStatus(['100'])).size,1);
 await assert.rejects(()=>workshopMutate({...entry,entryKind:'equipment'},'user'),/já possui/);
 const second=await workshopMutate({action:'component_add',name:'Unidade compressora'},'user') as any;await workshopMutate({...entry,componentId:second.component.id},'user');
 assert.equal((await db.query<any>('SELECT count(*) n FROM web_workshop_visits WHERE exited_at IS NULL')).rows[0].n,3);
 await workshopMutate({action:'component_update',componentId:type,version:1,name:'Motor'},'admin');
 assert.equal((await db.query<any>('SELECT source FROM web_workshop_visits WHERE id=$1',[visit.id])).rows[0].source.componentName,'Motor elétrico');
 await assert.rejects(()=>workshopMutate({action:'component_delete',componentId:type,version:1},'admin'),/mudou/);
 await workshopMutate({action:'component_delete',componentId:type,version:2},'admin');
 assert.equal((await db.query<any>('SELECT active FROM web_workshop_component_types WHERE id=$1',[type])).rows[0].active,false);
 await workshopMutate({action:'transfer',id:visit.id,version:visit.version,workshopId:'2',departedAt:'2025-01-02T12:00:00Z',arrivedAt:'2025-01-02T13:00:00Z',notes:'Enviar componente'},'user');
 visit=(await db.query<any>("SELECT * FROM web_workshop_visits WHERE source->>'componentId'=$1 AND exited_at IS NULL",[type])).rows[0];assert.equal(visit.source.entryKind,'component');assert.equal(String(visit.workshop_id),'2');
 await workshopMutate({action:'exit',id:visit.id,version:visit.version,notes:'Motor devolvido'},'user');
 assert.equal((await db.query<any>('SELECT count(*) n FROM web_workshop_visits WHERE exited_at IS NULL')).rows[0].n,2);
 assert.equal((await equipmentWorkshopStatus(['100'])).size,1);
 }finally{g.historyPool=old;await db.close();}
});
