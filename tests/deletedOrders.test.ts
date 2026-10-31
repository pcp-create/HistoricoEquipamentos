import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import type {Database} from '../src/database/postgres.js';
import {CycleRepository} from '../src/database/cycle.repository.js';
import {type Children,summaryHeaders} from '../src/m8/collections.js';
import {reconcileDeletedOrders} from '../src/sync/deletedOrders.js';
import {SafeError} from '../src/utils/logger.js';
test('missing orders require individual confirmation; outages preserve status; reappearance restores status and detail queue',async()=>{
 const db=new PGlite();const adapter=db as unknown as Database;
 try{
  for(const name of ['001_m8_history.sql','002_m8_observed_types.sql','003_m8_id_scan.sql','004_m8_approval_mixed.sql','005_m8_collection_cycle.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const repo=new CycleRepository(adapter,1,'America/Sao_Paulo');
  const rows=Array.from({length:9},(_,i)=>({id:i+1,status:'Pendente',clienteNome:'Cliente'}));
  await repo.ingestHeaders(summaryHeaders({data:rows}),new Date());
  await new CycleRepository(adapter,2,'America/Sao_Paulo').ingestHeaders(summaryHeaders({data:[rows[1]]}),new Date());
  const present=summaryHeaders({data:[rows[0]]});
  const result=await reconcileDeletedOrders(adapter,{company:1,get:async(_path,params)=>{
   switch(String(params.Id)){
    case '2':throw new SafeError('Ausente',404);
    case '3':return {data:[]};
    case '4':throw new SafeError('Indisponível',503);
    case '5':throw new SafeError('Sem acesso',401);
    case '6':return {data:[rows[5]]};
    case '7':return {data:[],errors:['erro']};
    case '8':return {data:[rows[0]]};
    default:throw new SafeError('Limite',429);
   }
  }},present,new Date());
  assert.equal(result.deleted,2);assert.equal(result.unconfirmed,5);
  const local=(await db.query<{id_m8:number;status:string;payload:any}>('SELECT * FROM m8_ordens_servico WHERE company_id=1 ORDER BY id_m8')).rows;
  assert.deepEqual(local.map(r=>r.status),['Pendente','Excluida','Excluida','Pendente','Pendente','Pendente','Pendente','Pendente','Pendente']);
  assert.equal(local[1]!.payload._m8Deletion.previousStatus,'Pendente');
  assert.equal((await db.query<{status:string}>('SELECT status FROM m8_ordens_servico WHERE company_id=2')).rows[0]!.status,'Pendente');
  await assert.rejects(()=>reconcileDeletedOrders(adapter,{company:1,get:async()=>{throw Error('must not call');}},[],new Date()));
  // A slow detail request and an older inventory must not resurrect a deleted OS.
  const empty:Children={produtos:[],servicos:[],apontamentos:[],equipamentos:[],checklistRespostas:[],anexos:[],manutencoes:[]};
  await repo.persist(summaryHeaders({data:[rows[1]]})[0]!,empty,false,false,'00000000-0000-4000-8000-000000000000');
  await repo.fail('2',new SafeError('Ausente',404),{});
  await repo.ingestHeaders(summaryHeaders({data:[rows[1]]}),new Date(0));
  assert.equal((await db.query<{status:string}>("SELECT status FROM m8_ordens_servico WHERE company_id=1 AND id_m8=2")).rows[0]!.status,'Excluida');
  assert.equal((await db.query<{pending:boolean}>('SELECT pending FROM integracao_m8_os_sync WHERE company_id=1 AND ordem_servico_id=2')).rows[0]!.pending,false);
  await repo.ingestHeaders(summaryHeaders({data:[rows[1]]}),new Date());
  const restored=(await db.query<{status:string;payload:any}>("SELECT status,payload FROM m8_ordens_servico WHERE company_id=1 AND id_m8=2")).rows[0]!;
  assert.equal(restored.status,'Pendente');assert.equal(restored.payload._m8Deletion,undefined);
  assert.equal((await db.query<{pending:boolean}>('SELECT pending FROM integracao_m8_os_sync WHERE company_id=1 AND ordem_servico_id=2')).rows[0]!.pending,true);
 }finally{await db.close();}
});
