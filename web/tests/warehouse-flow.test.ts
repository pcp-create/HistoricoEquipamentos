import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {changeWarehouseFlow,warehouseFlowStatuses} from '../lib/warehouse/flow';
import {M8RequestError} from '../lib/service-orders/m8';
test('warehouse flow changes PATCH the M8 once, preserve audit, reject stale changes and never replay uncertain writes',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,enabled boolean);INSERT INTO web_user_access VALUES('warehouse',true);
   CREATE TABLE service_order_registries(kind text,id int,name text,active boolean);INSERT INTO service_order_registries VALUES('flow-statuses',5,'Material separado',true),('flow-statuses',8,'Execução',true),('flow-statuses',9,'Inativo',false);
   CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,status text,status_lancamento_id int,status_lancamento_nome text,total_geral numeric,data_atualizacao timestamptz,payload jsonb DEFAULT '{}',PRIMARY KEY(company_id,id_m8));
   INSERT INTO m8_ordens_servico(company_id,id_m8,status,status_lancamento_id,status_lancamento_nome) VALUES(1,100,'Pendente',51,'Aguardando separação');`);
  await db.exec(readFileSync('sql/086_warehouse_flow.sql','utf8'));
  assert.equal((await warehouseFlowStatuses()).rows.length,2);
  let flow=51,patches=0;
  const session=async()=>async(path:string,body?:any,method?:string)=>{if(body){patches++;assert.equal(method,'PATCH');assert.equal(path,'/v1/assistenciatecnica/ordemservico/100/statusfluxo');flow=body.statusFluxoId;return null;}return [{id:100,status:'Pendente',statusLancamentoId:flow,statusLancamentoNome:flow===5?'Material separado':'Aguardando separação',totalGeral:20}];};
  const body={company:'1',order:'100',flowId:'5',expectedFlow:'51',requestId:randomUUID()};
  assert.equal((await changeWarehouseFlow(body,'warehouse',session as any)).state,'complete');
  assert.equal((await changeWarehouseFlow(body,'warehouse',session as any)).state,'complete');assert.equal(patches,1);
  assert.equal((await db.query<any>('SELECT status_lancamento_id FROM m8_ordens_servico')).rows[0].status_lancamento_id,5);
  const audit=(await db.query<any>('SELECT * FROM web_warehouse_flow_changes')).rows[0];assert.equal(audit.document.before,'Aguardando separação');assert.equal(audit.document.after,'Material separado');assert.equal(audit.actor,'warehouse');
  await assert.rejects(changeWarehouseFlow({...body,requestId:randomUUID(),flowId:'8'},'warehouse',session as any),/mudou/);
  await assert.rejects(changeWarehouseFlow({...body,requestId:randomUUID(),expectedFlow:'5',flowId:'9'},'warehouse',session as any),/ativo/);
  const uncertainBody={...body,requestId:randomUUID(),expectedFlow:'5',flowId:'8'};
  let uncertainWrites=0;const uncertain=async()=>async(_path:string,payload?:any)=>{if(payload){uncertainWrites++;throw new M8RequestError('Resposta incerta',true);}return [{id:100,status:'Pendente',statusLancamentoId:5}];};
  assert.equal((await changeWarehouseFlow(uncertainBody,'warehouse',uncertain as any)).state,'uncertain');
  assert.equal((await changeWarehouseFlow(uncertainBody,'warehouse',uncertain as any)).state,'uncertain');assert.equal(uncertainWrites,1);
 }finally{g.historyPool=old;await db.close();}
});
