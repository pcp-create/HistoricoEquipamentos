import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {addWarehouseMaterial,warehouseProducts} from '../lib/warehouse/materials';
import {claimWarehouseNotifications,acknowledgeWarehouseNotification} from '../lib/warehouse/notifications';
import {M8RequestError} from '../lib/service-orders/m8';

test('adding a warehouse product posts once, preserves ERP identity and logs uncertain writes without replay',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
   CREATE TABLE web_user_access(email text,enabled boolean,display_name text,managers jsonb,phone text);INSERT INTO web_user_access VALUES('warehouse',true,'Almoxarife','["manager"]',null),('manager',true,'Gestor','[]','5547999999999');
   CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,status text,numero_sequencia bigint,cliente_nome text,equipamento text,total_geral numeric,payload jsonb DEFAULT '{}',data_atualizacao timestamptz,PRIMARY KEY(company_id,id_m8));
   INSERT INTO m8_ordens_servico(company_id,id_m8,status,numero_sequencia,cliente_nome,equipamento) VALUES(1,100,'Pendente',15100,'Cliente teste','Compressor');
   CREATE TABLE m8_product_catalog(company_id int,product_id bigint,name text,unit text,payload jsonb);INSERT INTO m8_product_catalog VALUES(1,7,'Filtro','UN','{}'),(2,8,'Outro','L','{}');
   CREATE TABLE m8_product_current(company_id int,product_id bigint,sale_price numeric,stock numeric,available numeric,unit text,stock_at timestamptz,available_at timestamptz);
   INSERT INTO m8_product_current VALUES(1,7,10,20,15,'UN',now(),now());
   CREATE TABLE m8_os_produtos(company_id int,ordem_servico_id bigint,id_m8 bigint,produto_id bigint,produto_nome text,quantidade numeric,unidade_nome text,valor_unitario numeric,valor_total numeric,observacao_interna text,payload jsonb,updated_at timestamptz,sincronizado_em timestamptz,PRIMARY KEY(company_id,ordem_servico_id,id_m8));`);
  await db.exec(readFileSync('sql/083_warehouse_deliveries.sql','utf8'));await db.exec(readFileSync('sql/084_warehouse_returns.sql','utf8'));await db.exec(readFileSync('sql/085_warehouse_notifications.sql','utf8'));
  const calls:any[]=[];
  const session=async(company:number)=>async(path:string,body?:any)=>{
   assert.equal(company,1);calls.push({path,body});
   if(body){assert.equal(path,'/v1/assistenciatecnica/ordemservico/100/produto');return {id:55};}
   if(path.includes('ordemservicocompleta'))return [{id:100,produtos:[{id:55,produtoId:7,produtoNome:'Filtro',quantidade:2,unidadeNome:'UN',valorUnitario:10,valorTotal:20,observacaoInterna:'Incluído posteriormente pelo almoxarifado via portal.'}]}];
   return [{id:100,status:'Pendente',totalGeral:20}];
  };
  const body={company:'1',order:'100',product:'7',quantity:2,price:10,justification:'Troca necessária após diagnóstico',requestId:randomUUID()};
  await assert.rejects(addWarehouseMaterial({...body,justification:'  '},'warehouse',session as any),/justificativa/);
  assert.equal((await addWarehouseMaterial(body,'warehouse',session as any)).state,'complete');
  assert.equal((await addWarehouseMaterial(body,'warehouse',session as any)).state,'complete');
  assert.equal(calls.filter(c=>c.body).length,1);assert.equal(calls.find(c=>c.body).body.valorTotal,20);
  assert.match(calls.find(c=>c.body).body.observacaoInterna,/posteriormente/);
  assert.match(calls.find(c=>c.body).body.observacaoInterna,/Troca necessária após diagnóstico/);
  const notifications=await claimWarehouseNotifications();assert.equal(notifications.length,1);
  assert.equal(notifications[0].number,'5547999999999');
  for(const part of ['15100','Cliente teste','Compressor','7 · Filtro','10,00','20,00','Almoxarife','Troca necessária após diagnóstico'])assert.ok(notifications[0].text.includes(part),part);
  assert.equal((await claimWarehouseNotifications()).length,0);
  await acknowledgeWarehouseNotification(notifications[0].id.slice(10),notifications[0].token);
  await acknowledgeWarehouseNotification(notifications[0].id.slice(10),notifications[0].token);
  assert.equal((await db.query<any>('SELECT state FROM web_warehouse_notifications')).rows[0].state,'sent');

  assert.equal((await db.query<any>('SELECT produto_id::text FROM m8_os_produtos')).rows[0].produto_id,'7');
  const catalog=await warehouseProducts('1','Filtro');assert.equal(catalog.rows.length,1);assert.equal(Number(catalog.rows[0].supply.stock),20);
  await assert.rejects(addWarehouseMaterial({...body,quantity:3},'warehouse',session as any),/Identificador/);
  await assert.rejects(addWarehouseMaterial({...body,product:'8',requestId:randomUUID()},'warehouse',session as any),/empresa/);
  const uncertainBody={...body,requestId:randomUUID()};let writes=0;
  const uncertain=async()=>async(_path:string,payload?:any)=>{if(payload){writes++;throw new M8RequestError('Resposta incerta',true);}return [{id:100,status:'Pendente'}];};
  assert.equal((await addWarehouseMaterial(uncertainBody,'warehouse',uncertain as any)).state,'uncertain');
  assert.equal((await addWarehouseMaterial(uncertainBody,'warehouse',uncertain as any)).state,'uncertain');assert.equal(writes,1);
  assert.equal((await db.query('SELECT * FROM web_warehouse_notification_events')).rows.length,1);
  await assert.rejects(addWarehouseMaterial({...body,requestId:randomUUID()},'warehouse',session as any),/aguardando confirmação/);
  assert.equal((await db.query('SELECT * FROM web_warehouse_material_additions')).rows.length,2);
 }finally{g.historyPool=old;await db.close();}
});
