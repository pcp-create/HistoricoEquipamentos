import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { workshopVisits } from "../lib/workshop/visits";

test("batched workshop list preserves exact OS links, task privacy, imports and repeated stays", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
 CREATE TABLE web_workshop_visits(id uuid,equipment_id bigint,workshop_id bigint,entered_at timestamptz,source jsonb);
 CREATE TABLE web_workshops(id bigint,name text);
 CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,model text,serial text,payload jsonb);
 CREATE TABLE m8_person_equipment(equipment_id bigint,person_name text,present boolean);
 CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,produto_equipamento_id bigint,status text,status_lancamento_nome text);
 CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean);
 CREATE TABLE web_tasks(id bigint,title text,status text,equipment_id bigint,order_company int,order_id bigint,source_key text,restricted boolean);
 CREATE TABLE web_workshop_quotes(visit_id uuid,company_id int,quote_id bigint);
 CREATE TABLE m8_quotes(company_id int,id bigint,number text,status text,total numeric);
 CREATE TABLE web_quotes(id bigint,number text,client_name text,document jsonb);
 INSERT INTO web_workshops VALUES(1,'Oficina RJ');
 INSERT INTO m8_equipment_catalog VALUES(7,'Compressor','GA22','SER1','{}'),(8,'Secador','FD','SER2','{"familiaId":3}');
 INSERT INTO web_workshop_visits VALUES
 ('00000000-0000-4000-8000-000000000001',7,1,'2026-10-28','{"customer":"Cliente da entrada"}'),
 ('00000000-0000-4000-8000-000000000002',7,1,'2025-10-01','{}'),
 ('00000000-0000-4000-8000-000000000003',8,1,'2026-10-27','{}'),
 ('00000000-0000-4000-8000-000000000004',NULL,NULL,'2026-10-26','{"equipment_description":"Motor importado","customer":"Cliente importado"}');
 INSERT INTO m8_person_equipment VALUES(7,'Ana',true),(7,'Zelia',true),(7,'ZZ inativo',false);
 INSERT INTO m8_ordens_servico VALUES(1,100,10,7,'Pendente','Aguardando peças'),(2,100,20,NULL,'Aprovado',NULL),(1,101,11,7,'Processado',NULL),(1,102,12,NULL,'Pendente',NULL);
 INSERT INTO m8_order_equipment_links VALUES(1,100,7,false),(2,100,7,false),(1,102,7,true);
 INSERT INTO web_tasks VALUES
 (1,'Direta','not_started',7,NULL,NULL,'manual:1',false),
 (2,'Pela OS','in_progress',7,1,100,'manual:2',false),
 (3,'Restrita','not_started',7,NULL,NULL,'manual:3',true),
 (4,'Concluída','completed',7,NULL,NULL,'manual:4',false),
 (5,'Importada','not_started',NULL,NULL,NULL,'manual:workshop:00000000-0000-4000-8000-000000000004:5',false),
 (6,'OS processada','not_started',NULL,1,101,'manual:6',false),
 (7,'Vínculo obsoleto','not_started',NULL,1,102,'manual:7',false),
 (8,'Dois vínculos','not_started',7,1,100,'manual:workshop:00000000-0000-4000-8000-000000000001:8',false),
 (9,'Outra empresa','not_started',NULL,27404,100,'manual:9',false);
 INSERT INTO m8_quotes VALUES(1,10,'ORC-1','Pendente',100),(2,10,'ORC-2','Aprovado',250);
 INSERT INTO web_workshop_quotes VALUES('00000000-0000-4000-8000-000000000001',2,10);
 INSERT INTO web_quotes VALUES(1,'LOCAL-1','Cliente rascunho','{"equipmentId":"7"}'),(2,'LOCAL-2','Excluído','{"equipmentId":"7","deletedAt":"2026-10-01"}');
 `);
    const rows = await workshopVisits(db, false);
    assert.equal(rows.length, 4);
    const first = rows.find((v) => v.id.endsWith("1"))!,
      old = rows.find((v) => v.id.endsWith("2"))!,
      rental = rows.find((v) => v.id.endsWith("3"))!,
      imported = rows.find((v) => v.id.endsWith("4"))!;
    assert.deepEqual(
      first.orders.map((o: any) => `${o.company}:${o.id}`),
      ["1:100", "2:100"],
    );
    assert.deepEqual(
      first.tasks.map((t: any) => t.id),
      ["1", "2", "6", "8"],
    );
    assert.deepEqual(
      old.tasks.map((t: any) => t.id),
      ["1", "2", "6", "8"],
    );
    assert.equal(first.client, "Cliente da entrada");
    assert.equal(old.client, "Zelia");
    assert.equal(first.quotes[0].number, "ORC-2");
    assert.equal(first.quotes[0].company, 2);
    assert.equal(first.quotes[0].amount, 250);
    assert.deepEqual(
      first.drafts.map((d: any) => d.id),
      [1],
    );
    assert.equal(rental.rental, true);
    assert.deepEqual(rental.orders, []);
    assert.deepEqual(rental.tasks, []);
    assert.equal(imported.name, "Motor importado");
    assert.equal(imported.client, "Cliente importado");
    assert.equal(imported.workshop, "Oficina a confirmar");
    assert.deepEqual(
      imported.tasks.map((t: any) => t.id),
      ["5"],
    );
    const admin = await workshopVisits(db, true);
    assert.deepEqual(
      admin.find((v) => v.id === first.id)!.tasks.map((t: any) => t.id),
      ["1", "2", "3", "6", "8"],
    );
  } finally {
    await db.close();
  }
});
