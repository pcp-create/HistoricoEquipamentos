import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {defaultOperation} from '../lib/service-scheduling/default-operation';
test('new operations select the OS equipment, retaining name and avoiding ambiguous defaults',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,produto_equipamento_id bigint,payload jsonb);
 CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,serial text,present boolean);
 CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean);
 INSERT INTO m8_ordens_servico VALUES(1,100,7,'{}');
 INSERT INTO m8_equipment_catalog VALUES(7,'Compressor','ABC',true),(8,'Secador','DEF',true);
 INSERT INTO m8_order_equipment_links VALUES(1,100,8,false);`);
 const first=await defaultOperation(db,1,100);
 assert.equal(first.equipmentId,'7');assert.equal(first.equipment.name,'Compressor');
 await db.exec('UPDATE m8_ordens_servico SET produto_equipamento_id=NULL');
 assert.equal((await defaultOperation(db,1,100)).equipmentId,'8');
 await db.exec('INSERT INTO m8_order_equipment_links VALUES(1,100,7,false)');
 assert.equal((await defaultOperation(db,1,100)).equipmentId,'');
 assert.equal((await defaultOperation(db,2,100)).equipmentId,'');
 }finally{await db.close()}
});
