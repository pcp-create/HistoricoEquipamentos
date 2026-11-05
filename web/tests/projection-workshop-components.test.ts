import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {attachWorkshopAnnotations} from '../lib/sales-projection/workshop-annotations';import type{Detail}from '../lib/sales-projection/model';
test('projection distinguishes component-only stays, displays all component names and respects exits and companies',async()=>{
 const db=new PGlite(),g=globalThis as any,prior=g.historyPool;g.historyPool={query:db.query.bind(db)};
 try{
 await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,produto_equipamento_id bigint,status text,status_lancamento_nome text);CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean);CREATE TABLE web_workshops(id int,name text);CREATE TABLE web_workshop_visits(id text,equipment_id bigint,workshop_id int,entered_at timestamptz,exited_at timestamptz,reconciled_out_at timestamptz,stage text,source jsonb);
 INSERT INTO m8_ordens_servico VALUES(1,10,100,'Pendente','Em análise'),(2,10,200,'Pendente','Em análise'),(1,11,NULL,'Pendente','Em análise');INSERT INTO m8_order_equipment_links VALUES(1,11,100,false);INSERT INTO web_workshops VALUES(1,'Rio do Sul'),(2,'Lages');
 INSERT INTO web_workshop_visits VALUES('motor',100,1,now(),NULL,NULL,'repair','{"entryKind":"component","componentName":"Motor elétrico"}'),('unit',100,2,now(),NULL,NULL,'received','{"entryKind":"component","componentName":"Unidade compressora"}');`);
 const row=(id:string,company=1):Detail=>({id,company,kind:'salesPending',name:'Cliente',date:'2026-11-05',amount:100,fields:{}});
 const sales=[row('10'),row('10',2),row('11')];await attachWorkshopAnnotations(sales);
 assert.equal(sales[0].fields!.inWorkshop,'Somente componente');assert.equal(sales[0].workshop,undefined);assert.deepEqual(sales[0].workshopComponents?.map(c=>c.name).sort(),['Motor elétrico','Unidade compressora']);assert.equal(sales[1].fields!.inWorkshop,'Não');assert.equal(sales[2].workshopComponents?.length,2);
 await db.exec(`INSERT INTO web_workshop_visits VALUES('machine',100,2,now(),NULL,NULL,'repair','{}')`);await attachWorkshopAnnotations(sales);assert.equal(sales[0].fields!.inWorkshop,'Sim');assert.equal((sales[0] as Detail).workshop?.name,'Lages');
 await db.exec("UPDATE web_workshop_visits SET exited_at=now() WHERE id IN('motor','machine')");await attachWorkshopAnnotations(sales);assert.equal(sales[0].fields!.inWorkshop,'Somente componente');assert.equal(sales[0].workshop,undefined);assert.equal(sales[0].workshopComponents?.length,1);
 await db.exec("UPDATE web_workshop_visits SET reconciled_out_at=now() WHERE id='unit'");await attachWorkshopAnnotations(sales);assert.equal(sales[0].fields!.inWorkshop,'Não');assert.equal(sales.reduce((n,r)=>n+r.amount,0),300);
 }finally{g.historyPool=prior;await db.close();}
});
