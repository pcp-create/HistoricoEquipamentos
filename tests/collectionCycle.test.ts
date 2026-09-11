import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import type { Database } from '../src/database/postgres.js';
import { IntegrationRepository } from '../src/database/integracaoLog.repository.js';
import { CycleRepository } from '../src/database/cycle.repository.js';
import { collectionCycle } from '../src/sync/collectionCycle.js';
import { SUMMARY_ENDPOINT } from '../src/m8/inventory.js';
import { summaryHeaders, collectionNames, type Children } from '../src/m8/collections.js';
import { requestWithRetry } from '../src/utils/retry.js';
const db = new PGlite();
const adapter: Database = { async query<T extends pg.QueryResultRow>(sql: string, args?: unknown[]) { return db.query<T>(sql,args); } };
const integration = new IntegrationRepository(adapter);
const repo = new CycleRepository(adapter,1,'America/Sao_Paulo');
before(async () => {
  for (const name of ['001_m8_history.sql','002_m8_observed_types.sql','003_m8_id_scan.sql','004_m8_approval_mixed.sql','005_m8_collection_cycle.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  }
});
beforeEach(async () => { await db.exec('TRUNCATE m8_ordens_servico,integracao_m8_log,integracao_m8_checkpoint CASCADE'); });
after(async () => { await db.close(); });
const header = { id: 10, status: 'Processado', clienteNome: 'Cliente', dataAtualizacao: '2026-09-10T10:00:00' };
const base = { company: 1, timeZone: 'America/Sao_Paulo' };
const makeClient = (status = 'Processado', failService = false) => ({ ...base,
  get: async (path: string, params: Record<string,string|number|boolean>) => {
    if (path === SUMMARY_ENDPOINT) return { data: [{ ...header,status }] };
    if (path.endsWith('/produto')) return { data: [{ id: params.EstaExcluido ? 2 : 1, ordemServicoId: 10, estaExcluido: params.EstaExcluido }] };
    if (path.endsWith('/servico') && failService) throw new Error('private error');
    return { data: [] };
  },
});
test('summary fiscal duplicates preserve all document IDs and other conflicts fail closed', async () => {
  const snapshots = summaryHeaders({ data: [{ ...header, documentoFiscalId: 5 }, { ...header, documentoFiscalId: 6 }] });
  assert.equal(snapshots.length,1); assert.equal(snapshots[0]?.header.documentoFiscalId,null);
  await repo.ingestHeaders(snapshots,new Date());
  assert.equal((await db.query('SELECT * FROM m8_ordens_servico')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM m8_os_documentos_fiscais')).rows.length,2);
  assert.throws(()=>summaryHeaders({data:[header,{...header,clienteNome:'Diferente'}]}),/divergem/);
});
test('new processed OS imports all collections before freezing and later inventory skips details', async () => {
  await collectionCycle(makeClient(),integration);
  const state=(await db.query<{ finalized:boolean;pending:boolean;collections:Record<string,string> }>('SELECT * FROM integracao_m8_os_sync')).rows[0]!;
  assert.equal(state.finalized,true); assert.equal(state.pending,false);
  assert.ok(collectionNames.every(name=>state.collections[name]==='CONCLUIDO'));
  assert.equal((await db.query('SELECT * FROM m8_os_produtos')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM vw_os_materiais')).rows.length,1);
  let calls=0;
  await collectionCycle({...base,get:async path=>{calls++;assert.equal(path,SUMMARY_ENDPOINT);return {data:[header]};}},integration);
  assert.equal(calls,1);
  assert.equal(await integration.checkpoint(1),null);
});
test('a failed collection cannot freeze Processado or partially commit children; retry survives', async () => {
  await collectionCycle(makeClient('Processado',true),integration);
  const state=(await db.query<{ finalized:boolean;pending:boolean;collections:Record<string,string>;error:string }>('SELECT * FROM integracao_m8_os_sync')).rows[0]!;
  assert.equal(state.finalized,false);assert.equal(state.pending,true);assert.equal(state.collections.servicos,'ERRO');
  assert.ok(!state.error.includes('private'));
  assert.equal((await db.query('SELECT * FROM m8_os_produtos')).rows.length,0);
  await db.query('UPDATE integracao_m8_os_sync SET next_attempt_at=now()');
  await collectionCycle(makeClient(),integration,{resumeOnly:true});
  assert.equal((await db.query<{finalized:boolean}>('SELECT finalized FROM integracao_m8_os_sync')).rows[0]?.finalized,true);
});
test('transition during collection requires a final recheck and open OS are queued each cycle', async () => {
  let headers=0;
  const delegate=makeClient();
  await collectionCycle({...base,get:async(path,params)=>{
    if(path===SUMMARY_ENDPOINT){headers++;return {data:[{...header,status:headers<=2?'Pendente':'Processado'}]};}
    return delegate.get(path,params);
  }},integration,{maxOrders:1});
  const result=(await db.query<{pending:boolean;finalized:boolean}>('SELECT pending,finalized FROM integracao_m8_os_sync')).rows[0]!;
  assert.deepEqual(result,{pending:true,finalized:false});
  await db.query('UPDATE integracao_m8_os_sync SET next_attempt_at=now()');
  await collectionCycle(makeClient('Pendente'),integration,{resumeOnly:true});
  await repo.ingestHeaders(summaryHeaders({data:[{...header,status:'Pendente'}]}),new Date());
  assert.equal(await repo.next(),'10');
});
test('malformed child rolls back parent/detail completion and maintenance supports multiple records', async () => {
  const snapshots=summaryHeaders({data:[header]});await repo.ingestHeaders(snapshots,new Date());
  const logId=await integration.start(1,'TESTE',{from:new Date(),to:new Date()});
  const children=Object.fromEntries(collectionNames.map(name=>[name,[]])) as unknown as Children;
  children.produtos=[{id:1,quantidade:'not numeric'}];
  await assert.rejects(repo.persist(snapshots[0]!,children,true,false,logId));
  assert.equal((await db.query<{finalized:boolean}>('SELECT finalized FROM integracao_m8_os_sync')).rows[0]?.finalized,false);
  children.produtos=[];children.manutencoes=[{id:1,kmAtual:100},{id:2,kmAtual:200}];
  children.equipamentos=[{id:1,horimetro:'Sem leitura'},{id:2,horimetro:'12:30'}];
  await repo.persist(snapshots[0]!,children,true,false,logId);
  assert.equal((await db.query('SELECT * FROM m8_os_manutencoes')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM m8_equipamentos')).rows.length,2);
});
test('oversized HTTP bodies are cancelled without retrying the same oversized response', async () => {
  let calls=0;
  await assert.rejects(requestWithRetry('https://example.test/v1/test',{}, {timeoutMs:1000,maxAttempts:4,maxResponseBytes:4},async()=>{calls++;return new Response('12345');}),/limite de memória/);
  assert.equal(calls,1);
});
