import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {isChecklistEquipmentLinked} from '../lib/service-scheduling/checklist-equipment';

test('stale equipment links use explicit current OS IDs and retain isolation and removal checks',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint PRIMARY KEY,present boolean);
   INSERT INTO m8_equipment_catalog VALUES(7,true),(8,true);
   CREATE TABLE m8_order_equipment_links(equipment_id bigint,company_id integer,order_id bigint,stale boolean);
   INSERT INTO m8_order_equipment_links VALUES(7,1,100,true);
   CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,produto_equipamento_id bigint,payload jsonb);
   INSERT INTO m8_ordens_servico VALUES(1,100,NULL,'{"produtoEquipamentoId":"7"}');`);
  const linked=(equipment='7',company=1,order=100)=>isChecklistEquipmentLinked(db,equipment,company,order);
  assert.equal(await linked(),true);
  assert.equal(await linked('8'),false);
  assert.equal(await linked('7',2),false);
  assert.equal(await linked('7',1,101),false);
  await db.exec('UPDATE m8_equipment_catalog SET present=false WHERE equipment_id=7');
  assert.equal(await linked(),false);
  await db.exec('UPDATE m8_equipment_catalog SET present=true');
  await db.exec('UPDATE m8_ordens_servico SET produto_equipamento_id=8');
  assert.equal(await linked(),false);
  assert.equal(await linked('8'),true);
  await db.exec("UPDATE m8_ordens_servico SET produto_equipamento_id=NULL,payload='{}'");
  assert.equal(await linked(),false);
  await db.exec('UPDATE m8_order_equipment_links SET stale=false');
  assert.equal(await linked(),true);
 }finally{await db.close();}
});
