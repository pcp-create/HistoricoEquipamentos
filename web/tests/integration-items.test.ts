import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {integrationItems} from '../lib/integration-items';
test('orders sort numerically across pages and filter by the exact displayed number',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 g.historyPool={query:db.query.bind(db)};
 try{
 await db.exec("CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,cliente_nome text,status text,updated_at timestamptz); CREATE TABLE integracao_m8_os_sync(company_id int,ordem_servico_id bigint,last_detail_at timestamptz)");
 await db.exec("INSERT INTO m8_ordens_servico SELECT 1,n,n,'Cliente','Aberta',now() FROM generate_series(1,55) n; INSERT INTO m8_ordens_servico VALUES(2,999,56,'Cliente 14948','Aberta','2020-01-01'),(1,1000,14948,'Especial','Aberta','2020-01-01')");
 const fetch=(query:string)=>integrationItems(new URLSearchParams('integration=orders&'+query));
 const first=await fetch('');
 assert.equal(first.rows[0].code,'14948');assert.equal(first.rows[1].code,'56');assert.equal(first.hasNext,true);
 assert.equal((await fetch('page=2')).rows[0].code,'7');
 const exact=await fetch('orderNumber=14948');assert.equal(exact.rows.length,1);assert.equal(exact.rows[0].id,'1000');
 assert.equal((await fetch('orderNumber=1000')).rows.length,0);
 assert.equal((await fetch('orderNumber=14948&q=ausente')).rows.length,0);
 await assert.rejects(fetch('orderNumber=abc'),/número da OS/);
 }finally{g.historyPool=old;await db.close();}
});
