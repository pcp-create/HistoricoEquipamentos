import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  workshopFinancial,
  workshopFinancialOrders,
  workshopOrderItems,
  customerWorkshopValue,
} from "../lib/workshop/financial";

test("workshop values use only open billing/cost orders, explicit equipment links and company identities", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,produto_equipamento_id bigint,status text,situacao_nome text,total_geral numeric);
  CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean);
  INSERT INTO m8_ordens_servico VALUES
  (1,10,100,50,'Pendente','COBRANÇA CRM/AT',100.10),
  (2,10,200,50,'Aprovado','COBRANÇA A.T.',50.20),
  (1,11,101,50,'Processado','COBRANÇA CRM/AT',1000),
  (1,12,102,50,'Cancelado','COBRANÇA CRM/AT',2000),
  (1,13,103,50,'Pendente','GARANTIA',3000),
  (1,14,104,50,'Aprovado','CUSTO DE LOCAÇÃO',25.05),
  (1,15,105,NULL,'Pendente','COBRANÇA CRM/AT',10),
  (1,16,106,NULL,'Pendente','COBRANÇA CRM/AT',9000),
  (1,17,107,60,'Pendente','CUSTO DE LOCAÇÃO',NULL),
  (1,18,108,70,'Pendente','CUSTO DE LOCAÇÃO',0),
  (1,19,109,50,'Processado','CUSTO DE LOCAÇÃO',5000);
  INSERT INTO m8_order_equipment_links VALUES(1,10,50,false),(1,10,50,false),(1,15,50,false),(1,16,50,true),(1,10,80,false);`);
    const grouped = await workshopFinancialOrders(db, ["50", "60", "70", "80"]);
    const client = workshopFinancial(grouped.get("50")!, false, true);
    assert.equal(client.total, 160.3);
    assert.equal(client.orders.length, 3);
    assert.deepEqual(
      client.orders.map((o) => o.company + ":" + o.id),
      ["1:10", "1:15", "2:10"],
    );
    assert.equal(
      workshopFinancial(grouped.get("50")!, true, true).total,
      25.05,
    );
    assert.equal(workshopFinancial(grouped.get("60")!, true, true).total, null);
    assert.equal(workshopFinancial(grouped.get("60")!, true, true).missing, 1);
    assert.equal(workshopFinancial(grouped.get("70")!, true, true).total, 0);
    assert.equal(
      workshopFinancial(grouped.get("80")!, false, true).total,
      100.1,
    );
    assert.equal(workshopFinancial([], false, true).total, 0);
    assert.equal(workshopFinancial([], false, false).total, null);
    assert.equal(workshopFinancial([], false, false).unlinked, true);
    assert.equal((await workshopFinancialOrders(db, [])).size, 0);
    const rows = [
      ...client.orders,
      ...client.orders,
      { ...client.orders[0], id: "99", status: "Processado", amount: 999 },
    ];
    assert.equal(workshopFinancial(rows, false, true).total, 160.3);
    await db.exec(`CREATE TABLE m8_os_produtos(company_id int,ordem_servico_id bigint,id_m8 bigint,produto_nome text,referencia_fabricante text,quantidade numeric,unidade_nome text,valor_unitario numeric,valor_total numeric,esta_excluido boolean,aprovado text);
    CREATE TABLE m8_os_servicos(company_id int,ordem_servico_id bigint,id_m8 bigint,servico_nome text,quantidade numeric,valor_unitario numeric,valor_total numeric,payload jsonb);
    CREATE TABLE integracao_m8_os_sync(company_id int,ordem_servico_id bigint,last_detail_at timestamptz);
    INSERT INTO m8_os_produtos VALUES(1,10,1,'Filtro','ABC',2,'UN',10,20,false,'true'),(2,10,1,'Filtro outra empresa','XYZ',1,'UN',9,9,false,'false'),(1,10,2,'Item excluído',NULL,1,'UN',50,50,true,'true');
    INSERT INTO m8_os_servicos VALUES(1,10,1,'Revisão',2,40,80,'{}'),(1,11,1,'OS fechada',1,99,99,'{}');
    INSERT INTO integracao_m8_os_sync VALUES(1,10,'2026-10-28T12:00:00Z');`);
    const detail = await workshopOrderItems(db, client.orders);
    assert.equal(detail.length, 3);
    assert.equal(detail[0].products.length, 2);
    assert.equal(detail[0].services.length, 1);
    assert.equal(detail[0].services[0].name, "Revisão");
    assert.ok(detail[0].detailAt);
    assert.equal(detail[1].detailAt, null);
    assert.equal(detail[2].products[0].name, "Filtro outra empresa");
    assert.equal((await workshopOrderItems(db, [])).length, 0);
    const pending = customerWorkshopValue([
      { financial: client },
      { financial: client },
      {
        financial: workshopFinancial(grouped.get("50")!, true, true),
        rental: true,
      },
      { financial: client, exited_at: "2026-10-28" },
      { financial: client, reconciled_out_at: "2026-10-28" },
    ]);
    assert.deepEqual(pending, { total: 160.3, incomplete: 0, orders: 3 });
    assert.equal(
      customerWorkshopValue([
        { financial: client },
        { financial: workshopFinancial([], false, false) },
      ]).incomplete,
      1,
    );
  } finally {
    await db.close();
  }
});
