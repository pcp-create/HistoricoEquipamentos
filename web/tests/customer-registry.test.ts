import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {customerPatch,customerRegistry,syncCustomerDetails,saveCustomer,customerLookups} from '../lib/customer-registry/store';
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
 await db.exec("CREATE TABLE web_access_events(event text,email text,actor text,details jsonb)");
 const writes:any[]=[];let primary=9;
 const factory=(async()=>async(path:string,body?:any,method?:string)=>{
  if(body){writes.push({path,body,method});primary=body.vendedorId;return {};}
  if(path.startsWith('/v1/configuracoes/vendedor/'))return {id:10,ativo:true};
  if(path.includes('/vendedor?'))return [{vendedorId:primary,vendedorNome:primary===10?'Maria':'Carlos',padrao:true}];
  return {razaoSocial:'Cliente atualizado'};
 }) as any;
 const save={company:1,id:'7',version:1,assignee:'a@test',seller_user:'a@test',editM8:true,changes:{vendedorId:'10'},before:{vendedorId:'9'}};
 await assert.rejects(()=>saveCustomer({...save,editM8:false},'a@test',factory),/Ative/);
 await assert.rejects(()=>saveCustomer({...save,before:{vendedorId:'8'}},'a@test',factory),/alterado no M8/);
 await assert.rejects(()=>saveCustomer({...save,changes:{vendedorId:''}},'a@test',factory),/vendedor M8 válido/);
 assert.equal(writes.length,0);
 await saveCustomer(save,'a@test',factory);
 assert.deepEqual(writes,[{path:'/v1/configuracoes/cliente/7/vendedor',body:{vendedorId:10,padrao:true},method:'POST'}]);
 const updated=(await customerRegistry(1)).rows.find(r=>r.id==='7')!;
 assert.equal(updated.vendedorId,'10');assert.equal(updated.seller,'Maria');assert.equal(updated.seller_user,'a@test');
 const audit=(await db.query<any>("SELECT details FROM web_access_events WHERE event='customer_registry'")).rows[0].details;
 assert.equal(audit.vendedorId,10);assert.equal(audit.beforeVendedorId,'9');
 }finally{g.historyPool=old;await db.close()}
});

test('customer lookups provide the ERP seller catalogue',async()=>{
 const result=await customerLookups(1,(async()=>async(path:string)=>path.includes('classificacaopessoa')?[{id:3,nome:'Indústria'}]:[{id:9,razaoSocial:'Carlos',ativo:true},{id:10,razaoSocial:'Inativo',ativo:false}]) as any);
 assert.deepEqual(result,{classifications:[{id:'3',name:'Indústria'}],sellers:[{id:'9',name:'Carlos'}]});
});
