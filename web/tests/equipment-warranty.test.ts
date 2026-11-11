import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {activeEquipmentWarranty,warrantyEnd,warrantyPeriod,warrantyDay} from '../lib/equipment/warranty-period';
import {equipmentWarranty} from '../lib/equipment/warranty';
test('warranty periods use calendar months, inclusive expiry and Brazilian creation dates',()=>{
 assert.deepEqual(warrantyPeriod('3 meses'),{amount:3,unit:'months'});
 assert.equal(warrantyEnd('2026-01-31','3 meses'),'2026-04-30');
 assert.equal(warrantyEnd('2024-02-29','1 ano'),'2025-02-28');
 assert.equal(warrantyEnd('2026-11-01','90 dias'),'2027-01-30');
 assert.equal(warrantyPeriod('Sem garantia'),null);
 assert.equal(warrantyPeriod('0 dias'),null);
 assert.equal(warrantyDay('2026-11-12T01:00:00Z'),'2026-11-11');
 const rows=[{orderId:'1',startedAt:'2026-08-11',period:'3 meses'},{orderId:'2',startedAt:'2026-11-01',period:null}];
 assert.equal(activeEquipmentWarranty(rows,'2026-11-11')?.orderId,'1');
 assert.equal(activeEquipmentWarranty(rows,'2026-11-11')?.lastOrder.orderId,'2');
 assert.equal(activeEquipmentWarranty(rows,'2026-11-12'),null);
 assert.equal(activeEquipmentWarranty([{startedAt:'2026-11-12',period:'3 meses'}],'2026-11-11'),null);
 assert.equal(activeEquipmentWarranty([{startedAt:'2026-08-01',expiresAt:'2026-12-01',period:'1 dia'}],'2026-11-11')?.expiresAt,'2026-12-01');
});
test('equipment history excludes current and uncertain links, preserves applied warranty and includes unsynced ERP creations',async()=>{
 const db=new PGlite(),g=globalThis as any,previous=g.historyPool;
 g.historyPool={query:db.query.bind(db)};
 try{
  await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,emissao timestamptz,data_abertura timestamptz,data_garantia timestamptz,tipo_atendimento_nome text,tipo_atendimento_id int,ativo boolean,status text,produto_equipamento_id bigint);
  CREATE TABLE service_order_registries(kind text,id int,warranty_description text);
  CREATE TABLE service_order_submissions(company_id int,m8_id bigint,request jsonb,header jsonb,created_at timestamptz);
  CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean,method text);
  CREATE TABLE m8_equipamentos(company_id int,ordem_servico_id bigint,equipamento_produto_id bigint);
  CREATE TABLE web_service_operations(schedule_id int,document jsonb);
  CREATE TABLE web_service_schedules(id int,company_id int,order_id bigint);
  INSERT INTO service_order_registries VALUES('service-types',1,'1 dia');`);
  const date=new Date().toISOString();
  await db.query("INSERT INTO m8_ordens_servico VALUES(1,100,15000,$1,$1,NULL,'Corretiva',1,true,'Processado',7),(1,101,15001,$1,$1,NULL,'Outra',1,true,'Processado',8)",[date]);
  await db.query("INSERT INTO service_order_submissions VALUES(1,100,$1,'{}',$2)",[JSON.stringify({equipment:'7',warrantySnapshot:{description:'3 meses'}}),date]);
  assert.equal((await equipmentWarranty('7'))?.period,'3 meses','stored warranty overrides current registry');
  assert.equal(await equipmentWarranty('7','1','100'),null,'current OS cannot warn about itself');
  await db.exec("INSERT INTO m8_order_equipment_links VALUES(1,101,9,false,'review'),(1,101,10,true,'explicit')");
  assert.equal(await equipmentWarranty('9'),null);assert.equal(await equipmentWarranty('10'),null);
  await db.query("INSERT INTO service_order_submissions VALUES(2,200,$1,$2,$3)",[JSON.stringify({equipment:'9',warrantySnapshot:{description:'3 meses'}}),JSON.stringify({emissao:date}),date]);
  const unsynced=await equipmentWarranty('9');assert.equal(unsynced?.orderId,'200');assert.equal(unsynced?.company,'2');
  assert.equal(await equipmentWarranty('9','2','200'),null);
  await db.exec("UPDATE m8_ordens_servico SET status='Cancelado' WHERE id_m8=100");
  assert.equal(await equipmentWarranty('7'),null);
 }finally{g.historyPool=previous;await db.close();}
});
