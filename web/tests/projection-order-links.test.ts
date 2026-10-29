import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { attachLinkedOrders } from "../lib/sales-projection/order-links";
import type { Detail } from "../lib/sales-projection/model";
test("projection annotates explicit links by ERP company without altering totals", async () => {
  const db = new PGlite(), g = globalThis as any, previous = g.historyPool;
  try {
    await db.exec(`
      CREATE TABLE web_order_links(company_id int,order_id bigint,linked_company_id int,linked_order_id bigint);
      CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,payload jsonb,status_lancamento_nome text);
      INSERT INTO web_order_links VALUES(2,10,1,20),(1,10,2,30),(2,11,NULL,NULL);
      INSERT INTO m8_ordens_servico VALUES(1,20,15200,'{"tipoNome":"Manutenção corretiva"}','Separação'),(2,30,15300,'{"tipoNome":"Venda","statusLancamentoNome":"Faturado"}',NULL);
    `);
    let queries = 0;
    g.historyPool = { query: (sql: string, args?: any[]) => { queries++; return db.query(sql,args); } };
    const row = (id: string, sourceCompany: number): Detail => ({company:1,id,kind:"salesPending",name:"Cliente",date:"2026-10-28",amount:100,fields:{sourceCompany}});
    const rows = [row("10",2),row("10",1),row("11",2),row("12",2)];
    await attachLinkedOrders(rows);
    assert.equal(queries, 1);
    assert.deepEqual(rows[0].linkedOrder,{company:1,id:"20",number:"15200",orderType:"Manutenção corretiva",flowStatus:"Separação"});
    assert.equal(rows[1].linkedOrder?.number,"15300");
    assert.equal(rows[1].linkedOrder?.flowStatus,"Faturado");
    assert.equal(rows[2].linkedOrder,undefined);
    assert.equal(rows[3].linkedOrder,undefined);
    assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),400);
  } finally { g.historyPool = previous; await db.close(); }
});
