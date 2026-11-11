import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {processScheduleOrder} from '../lib/service-scheduling/process-order';
import {processOrderBlockReason} from '../lib/service-scheduling/process-order-policy';
import {M8RequestError} from '../lib/service-orders/m8';
import {advanceEdit} from '../lib/service-orders/edit';
test('processing permits no operations and otherwise requires reviewed operations',()=>{
 assert.equal(processOrderBlockReason([]),'');
 assert.match(processOrderBlockReason([{status:'executing'},{status:'reviewed'}]),/1 operação/);
 assert.equal(processOrderBlockReason([{status:'reviewed'},{status:'completed'}]),'');
 assert.match(processOrderBlockReason([{status:'reviewed'}],'Processado'),/já está processada/);
});
test('processing preserves ERP data, resumes confirmed steps and reconciles ambiguous writes without replay',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
 let source:any={id:100,status:'Pendente',statusLancamentoId:2,tipoId:1,clienteId:10,funcionarioId:20,condicaoPagamentoId:1,emissao:'2026-11-11T10:00:00',dataEntrega:'2026-11-11',dataEntregaPrevista:'2026-11-11',observacao:'Não alterar',contato:'Contato original',produtos:[{id:77,produtoId:40,quantidade:2,valorUnitario:10,valorTotal:18,percentualDesconto:10}],servicos:[]};
 const writes:any[]=[];let failPut=false,loseReply=false;
 const session=async(company:number)=>{assert.equal(company,1);return async(path:string,body?:any,method?:string)=>{
  if(!body)return [structuredClone(source)];
  writes.push({path,body,method});
  if(method==='PATCH'){source.statusLancamentoId=body.statusFluxoId;return {};}
  if(failPut)throw new M8RequestError('Recusado pelo M8',false);
  assert.equal(body.status,'Processado');assert.equal(body.observacao,'Não alterar');assert.equal(body.contato,'Contato original');assert.equal(body.produtos,undefined);assert.equal(body.servicos,undefined);
  source={...source,...body};
  if(loseReply)throw new M8RequestError('Resposta perdida',true);
  return {id:100};
 };};
 try{
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
  await db.exec(readFileSync(new URL('../sql/066_service_order_edits.sql',import.meta.url),'utf8'));
  await db.exec(`CREATE TABLE web_user_access(email text,enabled boolean);INSERT INTO web_user_access VALUES('planner',true);
  CREATE TABLE web_service_schedules(id bigint,company_id int,order_id bigint,active boolean);INSERT INTO web_service_schedules VALUES(1,1,100,true);
  CREATE TABLE web_service_operations(schedule_id bigint,status text);INSERT INTO web_service_operations VALUES(1,'executing');
  CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,status text,status_lancamento_id int,status_lancamento_nome text,payload jsonb DEFAULT '{}');INSERT INTO m8_ordens_servico(company_id,id_m8,status) VALUES(1,100,'Pendente');
  CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);`);
  const id=randomUUID();
  await assert.rejects(()=>processScheduleOrder('1',id,'planner',session),/Revise/);assert.equal(writes.length,0);
  await db.exec("UPDATE web_service_operations SET status='reviewed'");
  await assert.rejects(()=>processScheduleOrder('1',id,'other',session));assert.equal(writes.length,0);
  let result=await processScheduleOrder('1',id,'planner',session);assert.equal(result.state,'ready');assert.equal(result.nextStep,1);
  await assert.rejects(()=>advanceEdit('planner',id,session),/Processar OS/);
  failPut=true;result=await processScheduleOrder('1',id,'planner',session);assert.equal(result.state,'partial');assert.equal(result.nextStep,1);
  await db.exec("UPDATE web_service_operations SET status='awaiting_review'");
  await assert.rejects(()=>processScheduleOrder('1',id,'planner',session),/Revise/);
  await db.exec("UPDATE web_service_operations SET status='reviewed'");
  failPut=false;result=await processScheduleOrder('1',id,'planner',session);assert.equal(result.state,'complete');
  assert.equal(writes.filter(w=>w.method==='PATCH').length,1);
  assert.equal((await query<any>('SELECT status,status_lancamento_id FROM m8_ordens_servico')).rows[0].status,'Processado');
  assert.equal((await query<any>('SELECT * FROM web_access_events')).rows.length,1);
  const count=writes.length;await processScheduleOrder('1',id,'planner',session);assert.equal(writes.length,count);
  const ambiguous=randomUUID();source.status='Pendente';source.statusLancamentoId=2;
  await processScheduleOrder('1',ambiguous,'planner',session);
  loseReply=true;result=await processScheduleOrder('1',ambiguous,'planner',session);assert.equal(result.state,'uncertain');
  const before=writes.length;result=await processScheduleOrder('1',ambiguous,'planner',session);assert.equal(result.state,'complete');assert.equal(writes.length,before);
  await db.exec('DELETE FROM web_service_operations');
  source.status='Pendente';source.statusLancamentoId=2;loseReply=false;
  const emptyId=randomUUID();
  assert.equal((await processScheduleOrder('1',emptyId,'planner',session)).state,'ready');
  assert.equal((await processScheduleOrder('1',emptyId,'planner',session)).state,'complete');
 }finally{g.historyPool=old;await db.close();}
});
