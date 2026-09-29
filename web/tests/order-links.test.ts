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
 await db.exec(`CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text,status_lancamento_nome text,emissao timestamptz,data_abertura timestamptz);INSERT INTO m8_ordens_servico VALUES(1,1,100,'Cliente A','Compressor','Aberta',now(),now()),(2,2,200,'Cliente B','Filtro','Pendente',now(),now());`);
 assert.equal((await orderLinks('1','1','Cliente B')).orders?.length,1);
 await assert.rejects(()=>saveOrderLink('1','1',{version:null,target:{company:1,id:'1'}},'admin@test.com'),/mesma/);
 await assert.rejects(()=>saveOrderLink('1','1',{version:null,target:{company:2,id:'99'}},'admin@test.com'),/não encontrada/);
 const r=await saveOrderLink('1','1',{version:null,target:{company:2,id:'2'}},'admin@test.com');
 assert.equal((await orderLinks('1','1',null)).link.status_lancamento_nome,'Pendente');
 await db.exec("UPDATE m8_ordens_servico SET status_lancamento_nome='Faturada' WHERE company_id=2");
 assert.equal((await orderLinks('1','1',null)).link.status_lancamento_nome,'Faturada');
 await assert.rejects(()=>saveOrderLink('1','1',{version:null,target:null},'admin@test.com'),/alterado/);
 const cleared=await saveOrderLink('1','1',{version:r.link.version,target:null},'admin@test.com');assert.equal(cleared.link.linked_order_id,null);
 }finally{g.historyPool=old;await db.close()}
});
