import { deleteQuote } from "../lib/quotes/store";
import { createPlanQuote } from "../lib/equipment-management/plan-quote";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  saveEquipment,
  equipmentDetail,
  equipmentList,
  EquipmentConflict,
} from "../lib/equipment-management/store";
import { emptyOperating } from "../lib/equipment-management/planning";
test("equipment plans persist independently of M8, enforce scope/concurrency and keep intervention audit", async () => {
  const db = new PGlite(),
    global = globalThis as any,
    old = global.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const f of readdirSync(
      new URL("../../supabase/migrations/", import.meta.url),
    )
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(
        readFileSync(
          new URL("../../supabase/migrations/" + f, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      readFileSync(
        new URL("../sql/007_equipment_preventive.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(new URL("../sql/005_quotes.sql", import.meta.url), "utf8"),
    );
    for (const file of ["008_administration.sql", "009_employees.sql", "010_tasks.sql", "011_task_kanban.sql", "012_manual_tasks.sql", "016_task_order_links.sql", "020_task_process_history.sql"])
      await db.exec(readFileSync(new URL("../sql/" + file, import.meta.url), "utf8"));
    const query = db.query.bind(db);
    global.historyPool = {
      query,
      connect: async () => ({ query, release() {} }),
    };
    await db.exec(`INSERT INTO m8_equipment_catalog(company_id,equipment_id,name,model,payload,collected_at) VALUES(1,100,'GA 90','GA90','{}',now()),(1,200,'W800','W800','{}',now());
 INSERT INTO m8_person_equipment(company_id,person_id,link_id,equipment_id,person_name,payload,collected_at) VALUES(1,10,1,100,'Cliente A','{}',now()),(2,10,2,100,'Cliente A','{}',now());`);
    const user = {
      id: "user",
      email: "test@example.com",
      user_metadata: { name: "Equipe" },
    };
    await saveEquipment(
      {
        equipment: "100",
        action: "settings",
        version: null,
        document: {
          ...emptyOperating,
          hoursDay: 24,
          daysYear: 365,
          ownership: "customer",
        },
      },
      user,
    );
    const base = {
      name: "Preventiva 4000",
      hours: 4000,
      months: 6,
      lastDate: "2026-01-01",
      lastMeter: 1000,
      lastOrder: "",
      notes: "",
    };
    await saveEquipment(
      { equipment: "100", action: "plan", version: null, document: base },
      user,
    );
    await saveEquipment(
      {
        equipment: "100",
        action: "plan",
        version: null,
        document: { ...base, name: "Preventiva 8000", hours: 8000 },
      },
      user,
    );
    let detail = await equipmentDetail("100");
    assert.equal(detail.clients.length, 1);
    assert.equal(detail.plans.length, 2);
    const plan = detail.plans.find((p: any) => p.document.hours === 4000);
    await assert.rejects(() =>
      saveEquipment(
        {
          equipment: "200",
          action: "maintenance",
          id: plan.id,
          version: plan.version,
          document: { date: "2026-02-01", meter: 5100, notes: "", order: "" },
        },
        user,
      ),
    );
    await saveEquipment(
      {
        equipment: "100",
        action: "maintenance",
        id: plan.id,
        version: plan.version,
        document: {
          date: "2026-02-01",
          meter: 5100,
          notes: "Troca registrada",
          order: "",
        },
      },
      user,
    );
    detail = await equipmentDetail("100");
    const updated = detail.plans.find((p: any) => p.id === plan.id);
    assert.equal(updated.forecast.target, 9100);
    assert.equal(
      detail.plans.find((p: any) => p.id !== plan.id).document.lastMeter,
      1000,
    );
    assert.ok(
      detail.events.some(
        (e: any) =>
          e.kind === "maintenance" &&
          e.display_name === "Equipe" &&
          e.document.intervention.notes === "Troca registrada",
      ),
    );
    await assert.rejects(
      () =>
        saveEquipment(
          {
            equipment: "100",
            action: "plan",
            id: plan.id,
            version: 1,
            document: base,
          },
          user,
        ),
      EquipmentConflict,
    );
    await assert.rejects(() =>
      saveEquipment(
        {
          equipment: "100",
          action: "maintenance",
          id: plan.id,
          version: updated.version,
          document: { date: "2026-03-01", meter: 20, notes: "", order: "" },
        },
        user,
      ),
    );
    const larger = detail.plans.find((p: any) => p.document.hours === 8000);
    await saveEquipment(
      {
        equipment: "100",
        action: "maintenance",
        id: larger.id,
        version: larger.version,
        document: {
          date: "2026-03-01",
          meter: 9000,
          order: "",
          notes: "Revisão maior",
        },
      },
      user,
    );
    const cascaded = await equipmentDetail("100");
    assert.ok(
      cascaded.plans.every(
        (p: any) =>
          p.document.lastDate === "2026-03-01" && p.document.lastMeter === 9000,
      ),
    );
    assert.ok(
      cascaded.events.some(
        (e: any) =>
          e.document.cascade === true && e.document.sourcePlan === larger.id,
      ),
    );
    await db.exec(
      "UPDATE m8_equipment_catalog SET name='Novo nome' WHERE equipment_id=100",
    );
    assert.equal((await equipmentDetail("100")).plans.length, 2);
    const list = await equipmentList(new URLSearchParams("q=cliente+a"));
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].plans, 2);
    await saveEquipment(
      {
        equipment: "100",
        action: "archive",
        id: plan.id,
        version: cascaded.plans.find((p: any) => p.id === plan.id).version,
      },
      user,
    );
    assert.equal((await equipmentDetail("100")).plans.length, 1);
    await db.exec(
      `UPDATE m8_equipment_catalog SET payload='{"familiaId":3}' WHERE equipment_id=100`,
    );
    await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,collected_at,payload) VALUES
      (1,100,now(),'{}'),(2,100,now(),' {"codigoIdentificacaoInterno":"LOC-007"}');`);
    assert.equal(
      (await equipmentDetail("100")).equipment.internal_code,
      "LOC-007",
    );
    assert.equal(
      (await equipmentList(new URLSearchParams("q=LOC-007"))).total,
      1,
    );
    await db.exec(
      `UPDATE m8_equipment_catalog SET payload=payload || '{"codigoIdentificacaoInterno":"EQ-008"}' WHERE equipment_id=100`,
    );
    assert.equal(
      (await equipmentList(new URLSearchParams("rental=1"))).rows[0]
        .internal_code,
      "EQ-008",
    );
    assert.equal((await equipmentDetail("200")).equipment.internal_code, null);
    const rentals = await equipmentList(new URLSearchParams("rental=1"));
    assert.equal(rentals.total, 1);
    assert.equal(rentals.rows[0].id, "100");
    assert.equal(rentals.rows[0].ownership, "own");
    assert.equal((await equipmentDetail("100")).equipment.rental, true);
    assert.equal(
      (await equipmentList(new URLSearchParams("ownership=own"))).total,
      1,
    );
    assert.equal((await equipmentDetail("200")).equipment.rental, false);
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,status,emissao,payload) VALUES
      (1,501,'Processado','2026-01-01','{}'),(2,502,'Pendente','2026-02-01','{}'),
      (1,503,'Cancelado','2026-03-01','{}'),(1,504,'Pendente','2026-04-01','{}');
      INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,aprovado,payload) VALUES
      (1,501,501,100,true,'{}'),(2,502,502,100,true,'{}'),
      (1,503,503,100,true,'{}'),(1,504,504,100,false,'{}');
      INSERT INTO m8_order_equipment_links(company_id,order_id,equipment_id,method,evidence) VALUES(1,504,100,'explicit','{}');`);
    const lastOrder = (await equipmentList(new URLSearchParams("q=EQ-008")))
      .rows[0].latest;
    assert.equal(lastOrder.order_id, "502");
    assert.equal(lastOrder.company_id, 2);
    assert.equal(lastOrder.status, "Pendente");
    await db.exec(
      "UPDATE m8_ordens_servico SET tipo_id=45,cliente_nome='Hospital São Clara' WHERE company_id=2 AND id_m8=502",
    );
    const byCustomer = await equipmentList(
      new URLSearchParams("q=hospital+sao+clara&rental=1&all=1"),
    );
    assert.equal(byCustomer.total, 1);
    assert.equal(byCustomer.counts.equipment, 1);
    assert.equal(byCustomer.rows[0].id, "100");
    assert.equal(byCustomer.rows[0].rentalStatus.key, "loaned");
    assert.equal(
      (await equipmentList(new URLSearchParams("q=emprestado&rental=1"))).total,
      1,
    );
    assert.equal(
      (
        await equipmentList(
          new URLSearchParams("q=cliente+inexistente&rental=1"),
        )
      ).total,
      0,
    );
    await db.exec(
      "UPDATE m8_ordens_servico SET tipo_id=8 WHERE company_id=2 AND id_m8=502",
    );
    assert.equal(
      (await equipmentList(new URLSearchParams("q=hospital+sao+clara&all=1")))
        .rows[0].rentalStatus.key,
      "rented",
    );
    await db.exec(`INSERT INTO m8_product_catalog(company_id,product_id,name,unit,sale_price,payload,collected_at) VALUES(1,900,'Filtro original','UN',25,'{}',now()),(1,902,'Material sem unidade',NULL,NULL,'{}',now());
      INSERT INTO m8_service_catalog(company_id,service_id,name,unit,sale_price,payload,collected_at) VALUES(1,901,'Mão de obra','H',NULL,'{}',now());`);
    await saveEquipment(
      {
        equipment: "100",
        action: "plan",
        version: null,
        document: {
          ...base,
          name: "Plano com itens",
          items: [
            {
              kind: "material",
              code: "900",
              name: "Nome desatualizado",
              unit: "Pacote",
              unitEditable: true,
              quantity: "2.5",
            },
            {
              kind: "service",
              code: "901",
              name: "Mão de obra",
              unit: "Pacote",
              quantity: "3",
            },
            {
              kind: "material",
              code: "902",
              name: "Material sem unidade",
              unit: "Kit",
              quantity: "1",
            },
          ],
        },
      },
      user,
    );
    const itemPlan = (await equipmentDetail("100")).plans.find(
      (p: any) => p.document.name === "Plano com itens",
    );
    assert.equal(itemPlan.document.items[0].name, "Filtro original");
    assert.equal(itemPlan.document.items[0].unit, "UN");
    assert.equal(itemPlan.document.items[0].unitEditable, false);
    assert.equal(itemPlan.document.items[1].unit, "Pacote");
    assert.equal(itemPlan.document.items[1].unitEditable, true);
    assert.equal(itemPlan.document.items[2].unit, "Kit");
    assert.equal(itemPlan.document.items[2].unitEditable, true);
    await db.exec(`INSERT INTO m8_ordens_servico(company_id,id_m8,cliente_id,cliente_nome,produto_equipamento_id,status,emissao,payload) VALUES
      (1,600,10,'Cliente A',100,'Processado','2026-06-15','{}'),(1,601,10,'Cliente A',100,'Processado','2026-07-15','{}'),(1,602,11,'Outro cliente',100,'Processado','2026-08-15','{}');
      INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,finalized,pending,last_detail_at) VALUES(1,600,now(),true,false,now()),(1,601,now(),true,false,now()),(1,602,now(),true,false,now());
      INSERT INTO m8_os_produtos(company_id,id_m8,ordem_servico_id,produto_id,produto_nome,unidade_nome,quantidade,valor_total,aprovado,payload) VALUES
      (1,600,600,900,'Filtro original','UN',2,80,'Sim','{}'),(1,601,601,900,'Filtro original','UN',2,9999,'Nao','{}'),(1,602,602,900,'Filtro original','UN',2,5000,'Sim','{}');
      INSERT INTO m8_os_servicos(company_id,id_m8,ordem_servico_id,servico_id,servico_nome,quantidade,valor_total,payload) VALUES(1,600,600,901,'Mão de obra',1,750,'{}');`);
    const request = {
      equipment: "100",
      planId: itemPlan.id,
      version: itemPlan.version,
      company: "1",
      clientId: "10",
      requestId: randomUUID(),
    };
    await assert.rejects(
      createPlanQuote({ ...request, equipment: "200" }, user),
      /Plano não encontrado/,
    );
    await assert.rejects(
      createPlanQuote({ ...request, version: 99 }, user),
      /plano foi alterado/,
    );
    await assert.rejects(
      createPlanQuote({ ...request, clientId: "99" }, user),
      /Selecione um cliente/,
    );
    const taskId = (await db.query<{id:string}>(`INSERT INTO web_tasks(source_key,cycle,equipment_id,plan_id,origin,title,equipment_name,source_status,priority) VALUES('preventive-group:100','cycle',100,$1,'Preventiva de Equipamento de Cliente','Revisão','GA90','overdue','normal') RETURNING id`, [itemPlan.id])).rows[0].id;
    await db.query("INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Contato','Apenas nota',false,'test@example.com','Equipe')", [taskId]);
    assert.equal((await db.query<{status:string}>('SELECT status FROM web_tasks WHERE id=$1',[taskId])).rows[0].status,'not_started');
    const created = await createPlanQuote(request, user);
    const retry = await createPlanQuote(request, user);
    assert.equal((await db.query<{status:string}>('SELECT status FROM web_tasks WHERE id=$1',[taskId])).rows[0].status,'in_progress');
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM web_task_notes WHERE task_id=$1 AND title='Orçamento criado' AND quote_id=$2",[taskId,created.id])).rows[0].n,1);
    assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM web_task_quote_links WHERE task_id=$1',[taskId])).rows[0].n,1);

    assert.equal(created.id, retry.id);
    const drafts = (await db.query("SELECT * FROM web_quotes")).rows as any[];
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].document.client, "Cliente A");
    assert.equal(drafts[0].document.equipmentId, "100");
    assert.equal(drafts[0].document.items[0].quantity, "2.5");
    assert.equal(drafts[0].document.items[0].price, "40.00");
    assert.equal(drafts[0].document.items[0].referencePrice, "25.00");
    assert.equal(drafts[0].document.items[0].lastPrice, "40.00");
    assert.equal(drafts[0].document.items[1].price, "750.00");
    assert.equal(drafts[0].document.items[0].unit, "UN");
    assert.equal(drafts[0].document.items[1].unit, "Pacote");
    assert.equal(drafts[0].document.items[2].unit, "Kit");
    assert.equal(drafts[0].document.pendingAmounts, true);
    assert.equal(Number(drafts[0].total_cents), 235000);
    const afterQuote = await equipmentDetail("100");
    const quoteEvents = afterQuote.events.filter(
      (e: any) => e.document.action === "quote",
    );
    assert.equal(quoteEvents.length, 1);
    assert.equal(quoteEvents[0].plan_id, itemPlan.id);
    assert.equal(quoteEvents[0].document.quoteId, created.id);
    assert.deepEqual(
      afterQuote.plans.find((p: any) => p.id === itemPlan.id).document,
      itemPlan.document,
    );
    // If audit persistence fails the draft must roll back as well.
    await db.exec(`CREATE FUNCTION reject_quote_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.document->>'action'='quote' THEN RAISE EXCEPTION 'audit failed'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_quote_event BEFORE INSERT ON web_equipment_events FOR EACH ROW EXECUTE FUNCTION reject_quote_event();`);
    await assert.rejects(
      createPlanQuote({ ...request, requestId: randomUUID() }, user),
      /audit failed/,
    );
    assert.equal((await db.query("SELECT * FROM web_quotes")).rows.length, 1);
    await db.exec("DROP TRIGGER reject_quote_event ON web_equipment_events");
    await db.exec(
      "UPDATE web_equipment_plans SET archived=true WHERE id='" +
        itemPlan.id +
        "'",
    );
    await assert.rejects(
      createPlanQuote({ ...request, requestId: randomUUID() }, user),
      /arquivado/,
    );
    await deleteQuote(
      { id: created.id, version: created.version },
      user.email,
      "Equipe",
    );
    const deletedHistory = (await equipmentDetail("100")).events.find(
      (e: any) => e.document.quoteId === created.id,
    );
    assert.ok(deletedHistory.quote_deleted_at);
    assert.equal(deletedHistory.document.planName, "Plano com itens");
    await assert.rejects(createPlanQuote(request, user), /já foi excluído/);
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM web_task_notes WHERE task_id=$1 AND title='Orçamento excluído'",[taskId])).rows[0].n,1);

    const linked=(await db.query<{id:string}>("INSERT INTO web_tasks(source_key,cycle,equipment_id,origin,title,equipment_name,source_status,priority,order_company,order_id) VALUES('manual:os','manual',100,'Ordem de Serviço','Acompanhar OS','GA90','manual','normal',1,600) RETURNING id")).rows[0].id;
    await db.exec("UPDATE m8_ordens_servico SET status='Pendente' WHERE company_id=1 AND id_m8=600");
    await db.exec("UPDATE m8_ordens_servico SET status='Pendente' WHERE company_id=1 AND id_m8=600");
    await db.exec("UPDATE m8_os_produtos SET quantidade=3 WHERE company_id=1 AND ordem_servico_id=600");
    await db.exec("UPDATE m8_os_produtos SET quantidade=3 WHERE company_id=1 AND ordem_servico_id=600");
    const linkedNotes=(await db.query<{title:string}>("SELECT title FROM web_task_notes WHERE task_id=$1",[linked])).rows;
    assert.deepEqual(linkedNotes.map(n=>n.title),['OS vinculada atualizada','Material da OS atualizado']);
    assert.equal((await db.query<{status:string}>('SELECT status FROM web_tasks WHERE id=$1',[linked])).rows[0].status,'not_started');

  } finally {
    global.historyPool = old;
    await db.close();
  }
});
