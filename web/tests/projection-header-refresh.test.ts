import {test} from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {refreshProjectionOrder} from "../lib/sales-projection/refresh-order";
test("web header refresh compares ERP local timestamps in the same zone as the integrator",async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{
  await db.exec("CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,payload jsonb,status text,total_geral numeric,data_atualizacao timestamptz,data_entrega_prevista timestamptz,PRIMARY KEY(company_id,id_m8)); INSERT INTO m8_ordens_servico VALUES(1,15151,'{}','Pendente',10,'2026-10-27T20:00:58Z','2026-10-31T06:00:00Z')");
  await db.exec("CREATE TABLE integracao_m8_os_sync(company_id int,ordem_servico_id bigint,summary_status text,inventory_seen_at timestamptz,pending boolean DEFAULT true,finalized boolean DEFAULT false,next_attempt_at timestamptz DEFAULT now(),PRIMARY KEY(company_id,ordem_servico_id))");
  const query=(sql:string,args?:any[])=>db.query(sql.replace("BEGIN READ WRITE","BEGIN"),args);
  g.historyPool={connect:async()=>({query,release(){}})};
  const session=(at:string,date:string)=>async()=>async()=>[{id:15151,status:"Pendente",totalGeral:10,dataAtualizacao:at,dataEntregaPrevista:date}];
  await refreshProjectionOrder(1,"15151",session("2026-10-27T17:19:40.607","2026-11-19T03:00:00") as any);
  let sync=(await db.query<any>("SELECT * FROM integracao_m8_os_sync")).rows[0];
  assert.equal(sync.ordem_servico_id,15151);
  assert.equal(sync.pending,true);
  await db.exec("UPDATE integracao_m8_os_sync SET pending=false,finalized=true");
  let row=(await db.query<any>("SELECT * FROM m8_ordens_servico")).rows[0];
  assert.equal(new Date(row.data_atualizacao).toISOString(),"2026-10-27T20:19:40.607Z");
  assert.equal(row.payload.dataEntregaPrevista,"2026-11-19T03:00:00");
  await refreshProjectionOrder(1,"15151",session("2026-10-27T16:00:00","2026-10-31T03:00:00") as any);
  row=(await db.query<any>("SELECT * FROM m8_ordens_servico")).rows[0];
  assert.equal(row.payload.dataEntregaPrevista,"2026-11-19T03:00:00");

  await db.query("UPDATE m8_ordens_servico SET data_atualizacao='2026-10-29T15:06:24.313Z'");
  const processed=async()=>async()=>[{id:15151,status:"Processado",totalGeral:10,dataAtualizacao:"2026-10-29T12:06:24"}];
  await refreshProjectionOrder(1,"15151",processed as any);
  sync=(await db.query<any>("SELECT * FROM integracao_m8_os_sync")).rows[0];
  assert.equal(sync.pending,true);
  assert.equal(sync.finalized,false);
  assert.equal(sync.summary_status,"Processado");
  assert.equal((await db.query<any>("SELECT status FROM m8_ordens_servico")).rows[0].status,"Processado");
 }finally{g.historyPool=old;await db.close();}
});
