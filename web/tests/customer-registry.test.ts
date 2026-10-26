import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {customerPatch,customerRegistry,syncCustomerDetails} from '../lib/customer-registry/store';
test('M8 edits only send permitted fields and validate IDs and UF',()=>{
 assert.deepEqual(customerPatch({razaoSocial:' Cliente ',ufSigla:'sc',classificacaoId:'3'}),{razaoSocial:'Cliente',ufSigla:'SC',classificacaoId:3});
 assert.throws(()=>customerPatch({seller:'Alguém'}));assert.throws(()=>customerPatch({regiaoId:'Região Sul'}));assert.throws(()=>customerPatch({ufSigla:'XX'}));assert.throws(()=>customerPatch({razaoSocial:''}));
});
test('customer registry includes new ERP customers and keeps internal assignee across detail sync',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{
 await db.exec(`CREATE TABLE web_user_access(email text PRIMARY KEY,display_name text,enabled boolean,job_title text);INSERT INTO web_user_access VALUES('a@test','Ana',true,'Vendedor');
 CREATE TABLE m8_customer_directory(company_id integer,person_id bigint,name text,document text,payload jsonb,collected_at timestamptz DEFAULT now());
 CREATE TABLE web_task_territories(city_key text,uf text,mesoregion text,microregion text);
 INSERT INTO web_task_territories VALUES('SAOJOSE','SC','Grande Florianópolis','Florianópolis');
 INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload) VALUES(1,7,'Cliente','123','{"razaoSocial":"Cliente","municipioNome":"São José","ufSigla":"SC"}');`);
 await db.exec(readFileSync(new URL('../sql/075_customer_registry.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../sql/076_customer_seller.sql',import.meta.url),'utf8'));
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 await db.exec("INSERT INTO web_customer_registry(company_id,person_id,assignee,seller_user) VALUES(1,7,'a@test','a@test')");
 const calls:string[]=[];
 await syncCustomerDetails(1,['7'],(async()=>async(path:string)=>{calls.push(path);return path.includes('/vendedor')?[{vendedorId:9,vendedorNome:'Carlos',padrao:true}]:{razaoSocial:'Cliente atualizado',municipioNome:'São José',ufSigla:'SC',classificacaoId:3,classificacaoNome:'Indústria'};}) as any);
 const result=await customerRegistry(1);
 assert.equal(result.rows[0].assignee,'a@test');assert.equal(result.rows[0].seller_user,'a@test');assert.equal(result.rows[0].seller,'Carlos');assert.equal(result.rows[0].classificacaoNome,'Indústria');assert.equal(result.rows[0].mesoregion,'Grande Florianópolis');
 await db.exec(`INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload) VALUES(1,8,'Novo cliente','456','{}')`);
 await db.exec(`INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload) VALUES(2,7,'Mesmo cliente','123','{}'),(27404,7,'Mesmo cliente','123','{}')`);
 assert.equal((await customerRegistry(1)).rows.length,2);assert.equal((await customerRegistry(1)).rows.find(r=>r.id==='8')?.assignee,'');
 await db.exec(`CREATE TABLE m8_customer_commercial(person_id bigint PRIMARY KEY,detail jsonb,sellers jsonb,synced_at timestamptz);
 INSERT INTO m8_customer_commercial VALUES(7,'{"razaoSocial":"Atualizado pelo integrador"}','[{"vendedorNome":"Vendedor novo"}]',now()+interval '1 minute')`);
 const imported=(await customerRegistry(1)).rows.find(r=>r.id==='7')!;
 assert.equal(imported.name,'Atualizado pelo integrador');assert.equal(imported.seller,'Vendedor novo');
 assert.equal(imported.seller_user,'a@test');assert.equal(imported.assignee,'a@test');
 await db.exec("UPDATE m8_customer_commercial SET synced_at=now()-interval '1 day'");
 assert.equal((await customerRegistry(1)).rows.find(r=>r.id==='7')?.seller,'Carlos');
 assert.ok(calls.every(path=>path.startsWith('/v1/configuracoes/cliente/7')));
 }finally{g.historyPool=old;await db.close()}
});
