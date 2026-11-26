import {mutateSchedule} from "../lib/service-scheduling/store";
import {ensureCreatedOrderProjection} from "../lib/service-orders/local-projection";
import {scheduleUrl} from "../lib/service-scheduling/schedule-url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  parseOrder,
  itemPayload,
  extraPayload,
  brazilNow,
} from "../lib/service-orders/model";
import {
  prepareOrder,
  advanceOrder,
  retryOrder,
  submissions,
} from "../lib/service-orders/store";
import { orderLookups } from "../lib/service-orders/lookups";
import { m8Session, M8RequestError } from "../lib/service-orders/m8";
import { saveRegistry, listRegistry } from "../lib/service-orders/registries";
const draft = {
  company: "2",
  type: "1",
  customer: "10",
  equipment: "100",
  serviceType: "1",
  origin: "1",
  seller: "20",
  technician: "tech@example.com",
  payment: "1",
  expected: "2026-10-23",
  delivery: "2026-10-24",
  situation: "1",
  flowStatus: "1",
  freight: "1",
  notes: "Observações",
  internalNotes: "Internas",
  items: [
    {
      kind: "material",
      code: "50",
      name: "Filtro",
      quantity: "2",
      price: "12.30",
    },
    {
      kind: "service",
      code: "60",
      name: "Revisão",
      quantity: "1.5",
      price: "100",
    },
  ],
};
test("inspection type 6 permits no equipment while other types still require it",()=>{
 assert.equal(parseOrder({...draft,type:'6',equipment:''}).equipment,'');
 assert.throws(()=>parseOrder({...draft,type:'1',equipment:''}),/equipamento/);
 assert.throws(()=>parseOrder({...draft,type:'6',equipment:'invalid'}),/equipamento/);
});
test("validates required headers, dates, item IDs, quantities and totals", () => {
  assert.deepEqual(parseOrder(draft), draft);
  assert.throws(() => parseOrder({ ...draft, extra: { clienteId: "50" } }));
  assert.throws(() => parseOrder({ ...draft, extra: { status: "Inventado" } }));
  assert.throws(() =>
    parseOrder({ ...draft, extra: { dataFaturamento: "2026-02-30" } }),
  );
  assert.deepEqual(
    extraPayload(
      parseOrder({ ...draft, extra: { kmAtual: "0", contato: "Nome" } }).extra,
    ),
    { kmAtual: 0, contato: "Nome" },
  );

  assert.equal(parseOrder({ ...draft, freight: "0" }).freight, "0");
  assert.throws(() => parseOrder({ ...draft, freight: "" }));
  assert.equal(parseOrder({...draft,origin:"",internalNotes:""}).origin,"");
  assert.equal(parseOrder({...draft,origin:"",internalNotes:""}).internalNotes,"");
  assert.throws(() => parseOrder({...draft,origin:"inválida"}));
  for (const change of [
    { company: "3" },
    { notes: "" },
    { flowStatus: "" },
    { equipment: "1.5" },
    { expected: "2026-02-30" },
    { items: [{ ...draft.items[0], quantity: "0" }] },
    { items: [draft.items[0], draft.items[0]] },
  ])
    assert.throws(() => parseOrder({ ...draft, ...change }));
  assert.deepEqual(itemPayload(draft.items[0] as any, 99), {
    produtoId: 50,
    quantidade: 2,
    valorUnitario: 12.3,
    valorTotal: 24.6,
  });
  assert.equal(itemPayload(draft.items[1] as any, 99).responsavelTecnicoId, 99);
  assert.equal(
    brazilNow(new Date("2026-10-22T01:30:00Z")),
    "2026-10-21T22:30:00-03:00",
  );
});
test("M8 POST authenticates in selected company, never retries and classifies ambiguous replies", async () => {
  const env = { ...process.env };
  Object.assign(process.env, {
    M8_TENANT: "test",
    M8_USERNAME: "test",
    M8_PASSWORD: "test",
  });
  try {
    let posts = 0;
    const transport: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/auth/token")) {
        assert.equal(JSON.parse(String(init?.body)).company, 2);
        return Response.json({ data: { token: "fake" } });
      }
      posts++;
      throw Error("timeout");
    };
    const m = await m8Session(2, transport);
    await assert.rejects(
      () => m("/v1/assistenciatecnica/ordemservico", {}),
      (e: any) => e instanceof M8RequestError && e.uncertain,
    );
    assert.equal(posts, 1);
    const patch = await m8Session(2, async (url, init) => {
      if (String(url).endsWith("/auth/token"))
        return Response.json({ data: { token: "fake" } });
      assert.equal(init?.method, "PATCH");
      assert.deepEqual(JSON.parse(String(init?.body)), { statusFluxoId: 1 });
      return Response.json({ data: {}, errors: [] });
    });
    assert.deepEqual(
      await patch(
        "/v1/assistenciatecnica/ordemservico/777/statusfluxo",
        { statusFluxoId: 1 },
        "PATCH",
      ),
      {},
    );
  } finally {
    process.env = env;
  }
});
test("creation uses customer equipment rule, persists progress, isolates users and never repeats uncertain writes", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    previous = g.historyPool,
    oldFetch = globalThis.fetch,
    env = { ...process.env };
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,display_name text,enabled boolean);CREATE TABLE m8_order_type_catalog(id bigint PRIMARY KEY,name text,active boolean);CREATE TABLE registry_manual_updates(registry_key text PRIMARY KEY,updated_at timestamptz,updated_by text);`,
    );
    for(const name of ['001_m8_history','002_m8_observed_types','004_m8_approval_mixed','005_m8_collection_cycle'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
    await db.exec("ALTER TABLE web_user_access ADD COLUMN role text DEFAULT 'user';CREATE TABLE web_access_events(event text,email text,actor text,details jsonb);");
    for(const name of ['028_service_scheduling','030_service_schedule_visibility'])await db.exec(readFileSync(new URL('../sql/'+name+'.sql',import.meta.url),'utf8'));
    await db.exec(
      readFileSync(
        new URL("../sql/063_service_order_creation.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL("../sql/064_service_order_flow_status.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(`CREATE TABLE m8_customer_directory(company_id int,person_id bigint,name text,document text,payload jsonb DEFAULT '{}');CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,model text,serial text,present boolean,payload jsonb);CREATE TABLE m8_person_equipment(company_id int,person_id bigint,equipment_id bigint,present boolean);CREATE TABLE m8_product_catalog(company_id int,product_id bigint);CREATE TABLE m8_service_catalog(company_id int,service_id bigint);
 INSERT INTO web_user_access(email,display_name,enabled,m8_employee_id) VALUES('tech@example.com','Técnico',true,99);
 INSERT INTO m8_order_type_catalog VALUES(1,'Corretiva',true,true),(2,'Todas',true,false);
 INSERT INTO m8_customer_directory(company_id,person_id,name,document) VALUES(1,10,'Cliente','123'),(2,10,'Cliente duplicado','123');
 INSERT INTO m8_equipment_catalog VALUES(100,'Compressor','A','X',true,'{}'),(101,'Outro','B','Y',true,'{}');
 INSERT INTO m8_person_equipment VALUES(1,10,100,true);
 INSERT INTO m8_product_catalog VALUES(1,50);INSERT INTO m8_service_catalog VALUES(1,60);
 INSERT INTO service_order_registries(kind,id,name,updated_by,warranty_id,warranty_description) VALUES('service-types',1,'Corretiva','test',3,'90 dias'),('service-origins',1,'Contato','test',null,null),('payment-terms',1,'À vista','test',null,null),('order-statuses',1,'Aberta','test',null,null),('freight',1,'Sem frete','test',null,null),('flow-statuses',1,'Aberta','test',null,null);`);
    await db.exec(readFileSync(new URL('../sql/107_order_type_equipment_requirement.sql',import.meta.url),'utf8'));
    await db.exec(`CREATE TABLE web_equipment_customer_links(person_id bigint,equipment_id bigint);CREATE TABLE lead_equipment(customer_key text,equipment_id bigint);CREATE VIEW web_effective_person_equipment AS SELECT company_id,'m8:'||person_id::text customer_key,person_id,equipment_id,present,false integration_pending FROM m8_person_equipment UNION ALL SELECT 1,'m8:'||person_id::text,person_id,equipment_id,true,true FROM web_equipment_customer_links UNION ALL SELECT 1,customer_key,NULL::bigint,equipment_id,true,true FROM lead_equipment;
    CREATE TABLE crm_opportunities(id uuid PRIMARY KEY,customer_id bigint,lead_id uuid,origin_lead_id uuid);CREATE TABLE crm_proposals(id uuid PRIMARY KEY,opportunity_id uuid);INSERT INTO crm_opportunities VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10,NULL,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),('dddddddd-dddd-4ddd-8ddd-dddddddddddd',NULL,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');INSERT INTO crm_proposals VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd');INSERT INTO lead_equipment VALUES('lead:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',101);`);
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    Object.assign(process.env, {
      M8_TENANT: "test",
      M8_USERNAME: "test",
      M8_PASSWORD: "test",
    });
    globalThis.fetch = async (url) =>
      String(url).endsWith("/auth/token")
        ? Response.json({ data: { token: "fake" } })
        : Response.json({
            data: String(url).includes('/configuracoes/vendedor?')?[{id:20,razaoSocial:'Vendedor',ativo:true},{id:21,razaoSocial:'Outro vendedor',ativo:true},{id:22,razaoSocial:'Vendedor inativo',ativo:false}]:[{ vendedorId: 20, vendedorNome: "Vendedor", padrao: true }],
          });
    const only = await orderLookups(
      new URLSearchParams("lookup=equipment&type=1&customer=10"),
    );
    assert.equal(only.rows?.length, 1);
    const proposalEquipment = await orderLookups(new URLSearchParams('lookup=proposal-equipment&customer=10&proposal=cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
    assert.deepEqual(proposalEquipment.rows?.map((row:any)=>row.id), ['100','101']);
    assert.equal(proposalEquipment.rows?.find((row:any)=>row.id==='101').data.integrationPending,true);
    const leadEquipment=await orderLookups(new URLSearchParams('lookup=proposal-equipment&customer=&type=2&proposal=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'));
    assert.deepEqual(leadEquipment.rows?.map((row:any)=>row.id),['101']);
    await assert.rejects(()=>orderLookups(new URLSearchParams('lookup=proposal-equipment&customer=11&proposal=cccccccc-cccc-4ccc-8ccc-cccccccccccc')),/não corresponde/);
    await assert.rejects(() => orderLookups(new URLSearchParams('lookup=equipment&customer=10')), /tipo de OS/);
    assert.equal(
      (
        await orderLookups(
          new URLSearchParams("lookup=equipment&type=2&customer=10"),
        )
      ).rows?.length,
      2,
    );
    assert.equal(
      (await orderLookups(new URLSearchParams("lookup=customers"))).rows
        ?.length,
      1,
    );
    await assert.rejects(
      () => prepareOrder("user", randomUUID(), { ...draft, equipment: "101" }),
      /não pertence/,
    );
    await assert.rejects(
      () =>
        prepareOrder("user", randomUUID(), {
          ...draft,
          technician: "unconfigured@example.com",
        }),
      /ID do técnico/,
    );
    await db.exec("INSERT INTO m8_order_type_catalog(id,name,active,customer_equipment_only,equipment_required) SELECT 6,name,active,customer_equipment_only,false FROM m8_order_type_catalog WHERE id=1");
    const inspectionId=randomUUID();
    await prepareOrder('inspection-test',inspectionId,{...draft,type:'6',equipment:''});
    await db.exec('UPDATE m8_order_type_catalog SET equipment_required=false WHERE id=1');
    await prepareOrder('custom-optional',randomUUID(),{...draft,equipment:''});
    await db.exec('UPDATE m8_order_type_catalog SET equipment_required=true WHERE id IN(1,6)');
    await assert.rejects(prepareOrder('custom-required',randomUUID(),{...draft,equipment:''}),/equipamento/);
    await assert.rejects(prepareOrder('inspection-required',randomUUID(),{...draft,type:'6',equipment:''}),/equipamento/);
    await db.exec('UPDATE m8_order_type_catalog SET equipment_required=false WHERE id=6');

    const inspection=(await db.query<any>('SELECT items,header FROM service_order_submissions WHERE id=$1',[inspectionId])).rows[0];
    assert.equal(inspection.items.some((item:any)=>item.kind==='equipment'),false);
    assert.equal(inspection.header.tipoId,6);
    await db.exec('INSERT INTO web_equipment_customer_links VALUES(10,101)');
    const local=await orderLookups(new URLSearchParams('lookup=equipment&type=1&customer=10'));
    assert.equal(local.rows?.find((row:any)=>row.id==='101').data.integrationPending,true);
    await prepareOrder('local-pending-test',randomUUID(),{...draft,equipment:'101'});
    const manualSeller=randomUUID();
    await prepareOrder('manual-seller-test',manualSeller,{...draft,seller:'21'});
    assert.equal((await db.query<any>('SELECT header FROM service_order_submissions WHERE id=$1',[manualSeller])).rows[0].header.funcionarioId,21);
    await assert.rejects(()=>prepareOrder('manual-seller-test',randomUUID(),{...draft,seller:'22'}),/vendedor habilitado/);
    await assert.rejects(()=>prepareOrder('manual-seller-test',randomUUID(),{...draft,seller:'999999'}),/vendedor habilitado/);
    const withoutTech = randomUUID();
    await prepareOrder("optional-user", withoutTech, {
      ...draft,
      technician: "",
      origin: "",
      internalNotes: "",
    });
    const optional = (
      await db.query<any>(
        "SELECT header,items FROM service_order_submissions WHERE id=$1",
        [withoutTech],
      )
    ).rows[0];
    assert.ok(!("responsavelTecnicoId" in optional.header));
    assert.ok(!("origemId" in optional.header));
    assert.equal(optional.header.observacaoInterna,"");
    assert.ok(!("tecnicoId" in optional.items[0].payload));
    assert.ok(
      !(
        "responsavelTecnicoId" in
        optional.items.find((i: any) => i.kind === "service").payload
      ),
    );
    const key = randomUUID();
    await prepareOrder("user", key, draft,"2026-11-11T15:42:13.000Z");
    const repeated=await prepareOrder("user", key, draft,"2026-11-11T16:00:00.000Z");
    assert.equal(repeated.openedAt,"2026-11-11T12:42:13-03:00");
    assert.equal((await submissions("user")).length, 1);
    await assert.rejects(() => prepareOrder("other", key, draft));
    assert.equal((await submissions("other", key)).length, 0);
    const stored = (
      await db.query<any>(
        "SELECT header FROM service_order_submissions WHERE id=$1",
        [key],
      )
    ).rows[0].header;
    assert.deepEqual((await db.query<any>('SELECT request FROM service_order_submissions WHERE id=$1',[key])).rows[0].request.warrantySnapshot,{id:3,description:'90 dias'});
    assert.equal(stored.emissao,"2026-11-11T12:42:13-03:00");
    assert.equal(stored.funcionarioId, 20);
    assert.equal(stored.responsavelTecnicoId, 99);
    assert.equal(stored.tipoGarantiaId, 3);
    assert.ok(!("equipamentoProduto" in stored));
    const steps = (
      await db.query<any>(
        "SELECT items FROM service_order_submissions WHERE id=$1",
        [key],
      )
    ).rows[0].items;
    assert.equal(steps[0].kind, "equipment");
    assert.equal(steps[0].payload.equipamentoProdutoId, 100);
    assert.equal(steps[0].payload.tecnicoId, 99);
    assert.ok(!("horaAbertura" in stored));
    assert.ok(!("dataAbertura" in stored));
    assert.ok(!("vendedorId" in stored));
    let writes: string[] = [];
    const session = async (company: number) => {
      assert.equal(company, 2);
      return async (
        path: string,
        body?: unknown,
        method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
      ) => {
        if (path.endsWith("/statusfluxo")) {
          assert.equal(method, "PATCH");
          assert.deepEqual(body, { statusFluxoId: 1 });
          writes.push(path);
          return {};
        }
        assert.equal(method, "POST");
        if (path.endsWith("/equipamento"))
          assert.equal((body as any).equipamentoProdutoId, 100);
        writes.push(path);
        return { id: 777 };
      };
    };
    let r = await advanceOrder("user", key, session);
    assert.equal(r.m8Id, 777);
    assert.equal(r.state, "ready");
    r = await advanceOrder("user", key, session);
    assert.equal(r.nextItem, 1);
    const reject = async () => async () => {
      throw new M8RequestError("HTTP 400", false);
    };
    r = await advanceOrder("user", key, reject);
    assert.equal(r.state, "partial");
    assert.equal(r.nextItem, 1);
    r = await advanceOrder("user", key, session);
    assert.equal(r.state, "ready");
    r = await advanceOrder("user", key, session);
    assert.equal(r.state, "ready");
    r = await advanceOrder("user", key, reject);
    assert.equal(r.state, "partial");
    assert.equal(r.nextItem, 3);
    assert.equal(r.m8Id, 777);
    r = await advanceOrder("user", key, session);
    assert.equal(r.state, "complete");
    assert.equal((r as any).localSynced,true);
    const seededOrder=(await db.query<any>('SELECT * FROM m8_ordens_servico WHERE company_id=2 AND id_m8=777')).rows[0];
    assert.equal(seededOrder.cliente_id,10);assert.equal(seededOrder.cliente_nome,'Cliente duplicado');
    assert.equal(seededOrder.produto_equipamento_id,100);assert.equal(seededOrder.equipamento,'Compressor');
    assert.equal(seededOrder.data_atualizacao,null,'local confirmation must not make a later integrator timestamp stale');
    assert.equal(seededOrder.numero_sequencia,null,'never invent the public OS number from its ERP ID');
    assert.equal(Number((await db.query<any>('SELECT * FROM m8_os_produtos WHERE company_id=2 AND ordem_servico_id=777')).rows[0].quantidade),2);
    assert.equal((await db.query<any>('SELECT count(*)::int n FROM m8_os_servicos WHERE company_id=2 AND ordem_servico_id=777')).rows[0].n,1);
    const queue=(await db.query<any>('SELECT * FROM integracao_m8_os_sync WHERE company_id=2 AND ordem_servico_id=777')).rows[0];
    assert.equal(queue.pending,true);assert.equal(queue.last_detail_at,null);
    await db.exec("INSERT INTO web_user_access(email,display_name,enabled) VALUES('user','Planejador',true)");
    const scheduled=await mutateSchedule({action:'include',company:2,orderId:'777'},'user');
    assert.equal(scheduleUrl(scheduled.schedule),'/programacao?id='+scheduled.schedule.id);
    const operation=(await db.query<any>('SELECT * FROM web_service_operations WHERE schedule_id=$1',[scheduled.schedule.id])).rows[0];
    assert.equal(operation.document.equipmentId,'100');
    await db.query("UPDATE web_service_operations SET document=document||'{\"date\":\"2026-11-20\",\"responsible\":\"tech@example.com\"}'::jsonb WHERE id=$1",[operation.id]);
    // Simulate the later integrator enrichment on the same primary key.
    await db.exec("UPDATE m8_ordens_servico SET numero_sequencia=15099,cliente_nome='Cliente confirmado',data_atualizacao=now() WHERE company_id=2 AND id_m8=777;UPDATE integracao_m8_os_sync SET last_detail_at=now(),pending=false,finalized=true WHERE company_id=2 AND ordem_servico_id=777;");
    await ensureCreatedOrderProjection(2,777);
    assert.equal((await db.query<any>('SELECT cliente_nome FROM m8_ordens_servico WHERE company_id=2 AND id_m8=777')).rows[0].cliente_nome,'Cliente confirmado');
    assert.equal((await db.query<any>('SELECT document FROM web_service_operations WHERE id=$1',[operation.id])).rows[0].document.responsible,'tech@example.com');
    assert.equal((await db.query<any>('SELECT count(*)::int n FROM web_service_operations WHERE schedule_id=$1',[scheduled.schedule.id])).rows[0].n,1);
    await advanceOrder("user", key, session);
    assert.equal(writes.length, 5);
    assert.ok(writes[4].endsWith("/777/statusfluxo"));
    assert.ok(writes[1].endsWith("/777/equipamento"));
    assert.ok(writes[2].endsWith("/777/produto"));
    assert.ok(writes[3].endsWith("/777/servico"));
    // A local failure after ERP confirmation must stay complete and be repairable without ERP writes.
    const repairId=randomUUID();
    await db.query("INSERT INTO service_order_submissions(id,created_by,company_id,request,header,items,m8_id,state,next_item) SELECT $1,created_by,company_id,request,header,items,888,'complete',next_item FROM service_order_submissions WHERE id=$2",[repairId,key]);
    await db.exec('ALTER TABLE m8_os_produtos ADD CONSTRAINT reject_local_seed CHECK(ordem_servico_id<>888) NOT VALID');
    const failedLocal=await advanceOrder('user',repairId,session);
    assert.equal(failedLocal.state,'complete');assert.equal((failedLocal as any).localSynced,false);
    assert.equal((await db.query('SELECT 1 FROM m8_ordens_servico WHERE company_id=2 AND id_m8=888')).rows.length,0);
    assert.equal((await submissions('user',repairId))[0].state,'complete');
    await db.exec('ALTER TABLE m8_os_produtos DROP CONSTRAINT reject_local_seed');
    const repaired=await advanceOrder('user',repairId,session);
    assert.equal((repaired as any).localSynced,true);assert.equal(writes.length,5);
    assert.equal((await db.query('SELECT 1 FROM m8_ordens_servico WHERE company_id=2 AND id_m8=888')).rows.length,1);
    // A poll that saw the OS during creation must not hide items confirmed afterwards.
    const earlyPollId=randomUUID();
    await db.query("INSERT INTO service_order_submissions(id,created_by,company_id,request,header,items,m8_id,state,next_item) SELECT $1,created_by,company_id,request,header,items,999,'complete',next_item FROM service_order_submissions WHERE id=$2",[earlyPollId,key]);
    await db.exec("INSERT INTO m8_ordens_servico(company_id,id_m8,numero_sequencia,cliente_nome,payload) VALUES(2,999,15100,'Nome do ERP','{}');INSERT INTO integracao_m8_os_sync(company_id,ordem_servico_id,inventory_seen_at,last_attempt_at,last_detail_at,pending,finalized) VALUES(2,999,now()-interval '2 minutes',now()-interval '2 minutes',now()-interval '1 minute',false,true)");
    assert.equal((await advanceOrder('user',earlyPollId,session) as any).localSynced,true);
    assert.equal((await db.query('SELECT 1 FROM m8_os_produtos WHERE company_id=2 AND ordem_servico_id=999')).rows.length,1);
    assert.equal((await db.query<any>('SELECT pending FROM integracao_m8_os_sync WHERE company_id=2 AND ordem_servico_id=999')).rows[0].pending,true);
    assert.equal((await db.query<any>('SELECT numero_sequencia FROM m8_ordens_servico WHERE company_id=2 AND id_m8=999')).rows[0].numero_sequencia,15100);
    assert.equal(writes.length,5);


    const equipmentOnly = randomUUID();
    await prepareOrder("user", equipmentOnly, { ...draft, items: [] });
    assert.equal(
      (await advanceOrder("user", equipmentOnly, session)).state,
      "ready",
    );
    assert.equal(
      (await advanceOrder("user", equipmentOnly, session)).state,
      "ready",
    );
    assert.ok(writes.at(-1)?.endsWith("/equipamento"));
    assert.equal(
      (await advanceOrder("user", equipmentOnly, session)).state,
      "complete",
    );
    assert.ok(writes.at(-1)?.endsWith("/statusfluxo"));
    const legacy = randomUUID();
    await prepareOrder("user", legacy, draft);
    await db.query(
      "UPDATE service_order_submissions SET header=header||jsonb_build_object('equipamentoProduto',items->0->'payload'),items=(items-0)-2 WHERE id=$1",
      [legacy],
    );
    const before = writes.length;
    await advanceOrder("user", legacy, session);
    await advanceOrder("user", legacy, session);
    await advanceOrder("user", legacy, session);
    assert.deepEqual(writes.slice(before), [
      "/v1/assistenciatecnica/ordemservico",
      "/v1/assistenciatecnica/ordemservico/777/produto",
      "/v1/assistenciatecnica/ordemservico/777/servico",
    ]);
    const uncertain = randomUUID();
    await prepareOrder("user", uncertain, draft);
    let count = 0;
    const timeout = async () => async () => {
      count++;
      throw new M8RequestError("timeout", true);
    };
    assert.equal(
      (await advanceOrder("user", uncertain, timeout)).state,
      "uncertain",
    );
    await advanceOrder("user", uncertain, timeout);
    assert.equal(count, 1);
    const pending = (await submissions("user", uncertain))[0];
    await assert.rejects(()=>retryOrder("other",uncertain,pending.updatedAt,true),/não encontrado/);
    await assert.rejects(()=>retryOrder("user",uncertain,pending.updatedAt,false),/Confirme/);
    await assert.rejects(()=>retryOrder("user",uncertain,"2000-01-01T00:00:00Z",true),/andamento/);
    assert.equal((await retryOrder("user",uncertain,pending.updatedAt,true)).state,"ready");
    await assert.rejects(()=>retryOrder("user",uncertain,pending.updatedAt,true),/andamento/);
    const beforeRetry = writes.length;
    await advanceOrder("user",uncertain,session);
    assert.deepEqual(writes.slice(beforeRetry),["/v1/assistenciatecnica/ordemservico"]);
    const equipmentFailure = await advanceOrder("user",uncertain,timeout);
    assert.equal(equipmentFailure.m8Id,777);
    assert.equal(equipmentFailure.nextItem,0);
    assert.equal((await retryOrder("user",uncertain,equipmentFailure.updatedAt,true)).state,"partial");
    const beforeEquipmentRetry = writes.length;
    await advanceOrder("user",uncertain,session);
    assert.deepEqual(writes.slice(beforeEquipmentRetry),["/v1/assistenciatecnica/ordemservico/777/equipamento"]);
    await assert.rejects(()=>retryOrder("user",key,r.updatedAt,true),/andamento/);
    const crash = randomUUID();
    await prepareOrder("user", crash, draft);
    await db.query(
      "UPDATE service_order_submissions SET state='sending' WHERE id=$1",
      [crash],
    );
    await advanceOrder("user", crash, timeout);
    assert.equal(count, 2);
    await assert.rejects(()=>retryOrder("user",crash,new Date().toISOString(),true),/andamento/);
    const rejected = randomUUID();
    await prepareOrder("user",rejected,draft);
    const rejectedResult = await advanceOrder("user",rejected,reject);
    assert.equal((await retryOrder("user",rejected,rejectedResult.updatedAt,true)).state,"ready");
    await saveRegistry(
      "service-types",
      {
        id: 2,
        name: "Preventiva",
        active: true,
        warranty_id: 4,
        warranty_description: "180 dias",
      },
      "user",
    );
    const reg = await listRegistry("service-types");
    assert.equal(reg.rows.length, 2);
    assert.ok(reg.lastManualUpdate);
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("/auth/token"))
        return Response.json({ data: { token: "fake" } });
      assert.ok(String(url).includes("/v1/faturamento/status?"));
      assert.equal(init?.method, "GET");
      return Response.json({
        data: [
          { id: 20, nome: "Finalizado" },
          { id: 2, nome: "Aberto" },
        ],
        errors: [],
      });
    };
    await saveRegistry("flow-statuses", {}, "user");
    const flow = await listRegistry("flow-statuses");
    assert.deepEqual(
      flow.rows.map((r: any) => r.id),
      ["1", "2", "20"],
    );
    assert.ok(flow.rows.every((r: any) => r.active));
    assert.ok(flow.lastManualUpdate);
    const csvMigration = readFileSync(
      new URL(
        "../sql/065_manual_service_order_registries.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(csvMigration);
    await db.exec(csvMigration);
    const types = await listRegistry("service-types");
    assert.equal(types.rows.length, 33);
    assert.equal(types.rows.filter((r: any) => r.active).length, 30);
    assert.equal(types.rows.find((r: any) => r.id === "1").warranty_id, 3);
    assert.equal((await listRegistry("service-origins")).rows.length, 11);
    const situations = await listRegistry("order-statuses");
    assert.equal(situations.rows.length, 9);
    assert.equal(situations.rows[0].name, "COBRANÇA CRM/AT");
    globalThis.fetch = async () => {
      throw Error("Cadastro manual não deve consultar M8");
    };
    await saveRegistry(
      "order-statuses",
      { id: 7, name: "EM ATENDIMENTO", active: true },
      "user",
    );
    assert.ok((await listRegistry("order-statuses")).lastManualUpdate);
  } finally {
    g.historyPool = previous;
    globalThis.fetch = oldFetch;
    process.env = env;
    await db.close();
  }
});

test("service observations are validated and sent separately to M8", () => {
  const parsed = parseOrder({...draft, items: [{...draft.items[1], notes: "Orientação ao cliente", internalNotes: "Uso interno"}]});
  const payload = itemPayload(parsed.items[0]);
  assert.equal(payload.observacao, "Orientação ao cliente");
  assert.equal(payload.observacaoInterna, "Uso interno");
  assert.equal(itemPayload({...parsed.items[0], notes: "", internalNotes: ""}).observacaoInterna, "");
  assert.throws(() => parseOrder({...draft, items: [{...draft.items[1], notes: 42}]}));
  assert.throws(() => parseOrder({...draft, items: [{...draft.items[1], internalNotes: "x".repeat(20001)}]}));
});
