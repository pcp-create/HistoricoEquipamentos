import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {orderLinks,saveOrderLink} from '../lib/order-links';
test('links validate identity, persist/remove with concurrency control and read current linked status',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool,query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 for(const file of ['008_administration','029_order_links'])await db.exec(readFileSync(new URL('../sql/'+file+'.sql',import.meta.url),'utf8'));
 await db.exec("INSERT INTO web_order_links(company_id,order_id,linked_company_id,linked_order_id,updated_by) VALUES(1,9,2,8,'test'),(1,7,NULL,NULL,'test')");
 await db.exec(readFileSync(new URL('../sql/098_multiple_order_links.sql',import.meta.url),'utf8'));
 assert.equal((await db.query<any>('SELECT linked_order_id FROM web_order_links WHERE order_id=9')).rows[0].linked_order_id,8);
 assert.equal((await db.query<any>('SELECT count(*) n FROM web_order_links WHERE linked_order_id IS NULL')).rows[0].n,0);
 await db.exec('DELETE FROM web_order_links');
 await db.exec(`CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text,status_lancamento_nome text,emissao timestamptz,data_abertura timestamptz);INSERT INTO m8_ordens_servico VALUES(1,1,100,'Cliente A','Compressor','Aberta',now(),now()),(2,2,200,'Cliente B','Filtro','Pendente',now(),now()),(1,3,300,'Cliente C','Secador','Pendente',now(),now());`);
 assert.equal((await orderLinks('1','1','Cliente B')).orders?.length,1);
 await assert.rejects(()=>saveOrderLink('1','1',{version:null,target:{company:1,id:'1'}},'admin@test.com'),/mesma/);
 await assert.rejects(()=>saveOrderLink('1','1',{version:null,target:{company:2,id:'99'}},'admin@test.com'),/não encontrada/);
 const r=await saveOrderLink('1','1',{version:null,target:{company:2,id:'2'}},'admin@test.com');
 assert.equal((await orderLinks('1','1',null)).link.status_lancamento_nome,'Pendente');
 await db.exec("UPDATE m8_ordens_servico SET status_lancamento_nome='Faturada' WHERE company_id=2");
 assert.equal((await orderLinks('1','1',null)).link.status_lancamento_nome,'Faturada');
 const second=await saveOrderLink('1','1',{version:null,target:{company:1,id:'3'}},'admin@test.com');
 assert.equal(second.links!.length,2);
 assert.equal((await saveOrderLink('1','1',{version:null,target:{company:1,id:'3'}},'admin@test.com')).links!.length,2);
 await assert.rejects(()=>saveOrderLink('1','1',{action:'remove',version:99,target:{company:2,id:'2'}},'admin@test.com'),/alterado/);
 const cleared=await saveOrderLink('1','1',{action:'remove',version:r.link.version,target:{company:2,id:'2'}},'admin@test.com');
 assert.equal(cleared.links!.length,1);assert.equal(String(cleared.links![0].linked_order_id),'3');
 assert.equal((await db.query<any>("SELECT count(*) n FROM web_access_events WHERE event='order_link_updated'")).rows[0].n,4);
 }finally{g.historyPool=old;await db.close()}
});
