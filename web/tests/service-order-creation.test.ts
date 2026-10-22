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
  for (const change of [
    { company: "3" },
    { notes: "" },
    { flowStatus: "" },
    { internalNotes: "" },
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
    await db.exec(`CREATE TABLE m8_customer_directory(company_id int,person_id bigint,name text,document text);CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,model text,serial text,present boolean,payload jsonb);CREATE TABLE m8_person_equipment(company_id int,person_id bigint,equipment_id bigint,present boolean);CREATE TABLE m8_product_catalog(company_id int,product_id bigint);CREATE TABLE m8_service_catalog(company_id int,service_id bigint);
 INSERT INTO web_user_access VALUES('tech@example.com','Técnico',true,99);
 INSERT INTO m8_order_type_catalog VALUES(1,'Corretiva',true,true),(2,'Todas',true,false);
 INSERT INTO m8_customer_directory VALUES(1,10,'Cliente','123'),(2,10,'Cliente duplicado','123');
 INSERT INTO m8_equipment_catalog VALUES(100,'Compressor','A','X',true,'{}'),(101,'Outro','B','Y',true,'{}');
 INSERT INTO m8_person_equipment VALUES(1,10,100,true);
 INSERT INTO m8_product_catalog VALUES(1,50);INSERT INTO m8_service_catalog VALUES(1,60);
 INSERT INTO service_order_registries(kind,id,name,updated_by,warranty_id,warranty_description) VALUES('service-types',1,'Corretiva','test',3,'90 dias'),('service-origins',1,'Contato','test',null,null),('payment-terms',1,'À vista','test',null,null),('order-statuses',1,'Aberta','test',null,null),('freight',1,'Sem frete','test',null,null),('flow-statuses',1,'Aberta','test',null,null);`);
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
            data: [{ vendedorId: 20, vendedorNome: "Vendedor", padrao: true }],
          });
    const only = await orderLookups(
      new URLSearchParams("lookup=equipment&type=1&customer=10"),
    );
    assert.equal(only.rows?.length, 1);
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
    const withoutTech = randomUUID();
    await prepareOrder("optional-user", withoutTech, {
      ...draft,
      technician: "",
    });
    const optional = (
      await db.query<any>(
        "SELECT header,items FROM service_order_submissions WHERE id=$1",
        [withoutTech],
      )
    ).rows[0];
    assert.ok(!("responsavelTecnicoId" in optional.header));
    assert.ok(!("tecnicoId" in optional.items[0].payload));
    assert.ok(
      !(
        "responsavelTecnicoId" in
        optional.items.find((i: any) => i.kind === "service").payload
      ),
    );
    const key = randomUUID();
    await prepareOrder("user", key, draft);
    await prepareOrder("user", key, draft);
    assert.equal((await submissions("user")).length, 1);
    await assert.rejects(() => prepareOrder("other", key, draft));
    assert.equal((await submissions("other", key)).length, 0);
    const stored = (
      await db.query<any>(
        "SELECT header FROM service_order_submissions WHERE id=$1",
        [key],
      )
    ).rows[0].header;
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
        method: "POST" | "PATCH" = "POST",
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
    await advanceOrder("user", key, session);
    assert.equal(writes.length, 5);
    assert.ok(writes[4].endsWith("/777/statusfluxo"));
    assert.ok(writes[1].endsWith("/777/equipamento"));
    assert.ok(writes[2].endsWith("/777/produto"));
    assert.ok(writes[3].endsWith("/777/servico"));
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
    const crash = randomUUID();
    await prepareOrder("user", crash, draft);
    await db.query(
      "UPDATE service_order_submissions SET state='sending' WHERE id=$1",
      [crash],
    );
    await advanceOrder("user", crash, timeout);
    assert.equal(count, 1);
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
