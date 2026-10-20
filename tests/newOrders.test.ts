import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {insertNewOrders} from '../src/sync/newOrders.js';
import {summaryHeaders} from '../src/m8/collections.js';
test('fast discovery inserts headers and queues details without overwriting existing orders or queue state',async()=>{
 const db=new PGlite();
 try{
  for(const name of ['001_m8_history.sql','002_m8_observed_types.sql','003_m8_id_scan.sql','004_m8_approval_mixed.sql','005_m8_collection_cycle.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const headers=summaryHeaders({data:[{id:100,status:'Processado',clienteNome:'Novo',documentoFiscalId:12}]});
  assert.equal(await insertNewOrders(db,1,headers,'America/Sao_Paulo'),1);
  assert.equal((await db.query<{pending:boolean}>('SELECT pending FROM integracao_m8_os_sync')).rows[0]!.pending,true);
  await db.exec("UPDATE m8_ordens_servico SET cliente_nome='Detalhe recente'; UPDATE integracao_m8_os_sync SET pending=false,finalized=true");
  assert.equal(await insertNewOrders(db,1,headers,'America/Sao_Paulo'),0);
  assert.equal((await db.query<{cliente_nome:string}>('SELECT cliente_nome FROM m8_ordens_servico')).rows[0]!.cliente_nome,'Detalhe recente');
  assert.equal((await db.query<{pending:boolean}>('SELECT pending FROM integracao_m8_os_sync')).rows[0]!.pending,false);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM m8_os_documentos_fiscais')).rows[0]!.n,1);
 }finally{await db.close();}
});
