import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {overview as stable} from '../lib/history.stable';
import {overview as preview} from '../lib/history.preview';

test('import cards exclude deleted orders with or without details while preserving history totals',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try {
  await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,status text,cliente_id bigint);
    CREATE TABLE m8_os_produtos(company_id int,esta_excluido boolean);
    CREATE TABLE integracao_m8_os_sync(company_id int,ordem_servico_id bigint,last_detail_at timestamptz);
    INSERT INTO m8_ordens_servico VALUES(1,1,'Pendente',10),(1,2,'Excluida',10),(1,3,'Excluida',10),(1,4,'Pendente',10),(999,5,'Pendente',10);
    INSERT INTO integracao_m8_os_sync VALUES(1,1,now()),(1,2,NULL),(1,3,now()),(999,5,NULL);`);
  g.historyPool=db;
  for(const overview of [stable,preview]) {
   const row=await overview();
   assert.equal(row.orders,4);
   assert.equal(row.importable,2);
   assert.equal(row.imported,1);
  }
  await db.exec("INSERT INTO integracao_m8_os_sync VALUES(1,4,now())");
  for(const overview of [stable,preview]) {
   const row=await overview();
   assert.equal(row.imported,row.importable);
   assert.equal(row.orders,4);
  }
 } finally {g.historyPool=old;await db.close();}
});
