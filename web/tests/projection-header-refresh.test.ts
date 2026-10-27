import {test} from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {refreshProjectionOrder} from "../lib/sales-projection/refresh-order";
test("web header refresh compares ERP local timestamps in the same zone as the integrator",async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 try{
  await db.exec("CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,payload jsonb,status text,total_geral numeric,data_atualizacao timestamptz,data_entrega_prevista timestamptz,PRIMARY KEY(company_id,id_m8)); INSERT INTO m8_ordens_servico VALUES(1,15151,'{}','Pendente',10,'2026-10-27T20:00:58Z','2026-10-31T06:00:00Z')");
  const query=(sql:string,args?:any[])=>db.query(sql.replace("BEGIN READ WRITE","BEGIN"),args);
  g.historyPool={connect:async()=>({query,release(){}})};
  const session=(at:string,date:string)=>async()=>async()=>[{id:15151,status:"Pendente",totalGeral:10,dataAtualizacao:at,dataEntregaPrevista:date}];
  await refreshProjectionOrder(1,"15151",session("2026-10-27T17:19:40.607","2026-11-19T03:00:00") as any);
  let row=(await db.query<any>("SELECT * FROM m8_ordens_servico")).rows[0];
  assert.equal(new Date(row.data_atualizacao).toISOString(),"2026-10-27T20:19:40.607Z");
  assert.equal(row.payload.dataEntregaPrevista,"2026-11-19T03:00:00");
  await refreshProjectionOrder(1,"15151",session("2026-10-27T16:00:00","2026-10-31T03:00:00") as any);
  row=(await db.query<any>("SELECT * FROM m8_ordens_servico")).rows[0];
  assert.equal(row.payload.dataEntregaPrevista,"2026-11-19T03:00:00");
 }finally{g.historyPool=old;await db.close();}
});
