import { fieldMapData, saveFieldLocation } from "../lib/service-scheduling/field-map";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  chooseLocality,
  validPoint,
  type Locality,
} from "../lib/service-scheduling/map-model";
import {
  scheduleMapData,
  changeScheduleMap,
} from "../lib/service-scheduling/map-store";
const a = {
  address_id: "1",
  person_id: "7",
  address_type: "Padrao",
  street: "Rua A",
  number: "1",
  city: "Aurora",
  state: "SC",
  complement: null,
  district: null,
  postal_code: null,
  country: "Brasil",
} satisfies Locality;
test("locality selection respects explicit delivery and never silently chooses an ambiguous address", () => {
  assert.equal(chooseLocality([a], null).address?.address_id, "1");
  assert.equal(chooseLocality([a], "2").address, null);
  const delivery = { ...a, address_id: "2", address_type: "Entrega" };
  assert.equal(chooseLocality([a, delivery], null).address?.address_id, "2");
  assert.equal(
    chooseLocality([a, delivery, { ...delivery, address_id: "3" }], null)
      .address,
    null,
  );
  assert.equal(
    chooseLocality([a, delivery], "2", "1").address?.address_id,
    "1",
  );
  assert.equal(validPoint(null, 0), false);
  assert.equal(validPoint(-27, -49), true);
  assert.equal(validPoint(100, 0), false);
});
test("map uses company 1 for every OS and invalidates changed addresses; writes enforce ownership and admin access", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  g.historyPool = {
    query: db.query.bind(db),
    connect: async () => ({ query: db.query.bind(db), release() {} }),
  };
  try {
    await db.exec(`CREATE TABLE web_user_access(email text,role text,enabled boolean);
 INSERT INTO web_user_access VALUES('admin','admin',true),('tech','user',true);
 CREATE TABLE web_service_schedules(id bigint PRIMARY KEY,company_id integer,order_id bigint,active boolean);
 INSERT INTO web_service_schedules VALUES(1,2,100,true),(2,27404,101,true),(3,1,102,false);
 CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,cliente_id bigint,endereco_entrega_id bigint);
 INSERT INTO m8_ordens_servico VALUES(2,100,7,1),(27404,101,7,1),(1,102,7,1);
 CREATE TABLE m8_customer_localities(company_id integer,person_id bigint,address_id bigint,address_type text,street text,number text,letter text,complement text,district text,city text,state text,postal_code text,country text,present boolean);
 INSERT INTO m8_customer_localities VALUES(1,7,1,'Padrao','Rua A','1',NULL,NULL,NULL,'Aurora','SC',NULL,'Brasil',true),
 (2,7,2,'Entrega','Incorrect','1',NULL,NULL,NULL,'Aurora','SC',NULL,'Brasil',true);`);
    await db.exec(
      readFileSync(
        new URL("../sql/040_schedule_map.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(`ALTER TABLE web_user_access ADD PRIMARY KEY(email); ALTER TABLE web_user_access ADD COLUMN job_title text DEFAULT ''; ALTER TABLE web_user_access ADD COLUMN display_name text;
      UPDATE web_user_access SET job_title='Técnico',display_name='Técnico A' WHERE email='tech';
      CREATE ROLE anon; CREATE ROLE authenticated;
      ALTER TABLE m8_ordens_servico ADD COLUMN numero_sequencia bigint; ALTER TABLE m8_ordens_servico ADD COLUMN cliente_nome text;
      CREATE TABLE web_service_operations(schedule_id bigint,sent_at timestamptz,document jsonb,status text);
      INSERT INTO web_service_operations VALUES(1,now(),' {"responsible":"tech","date":"2000-01-01"}','executing'),(2,now(),'{"responsible":"admin"}','completed');
      CREATE TABLE web_field_events(actor text,latitude double precision,longitude double precision,accuracy double precision,located_at timestamptz);
      INSERT INTO web_field_events VALUES('tech',-26,-48,10,now()-interval '1 day');`);
    await db.exec(readFileSync(new URL('../sql/046_field_locations.sql',import.meta.url),'utf8'));
    let field=await fieldMapData('tech');
    assert.equal(field.orders.length,1);
    assert.equal(field.orders[0].id,'1');
    assert.equal(field.orders[0].status,'executing');
    assert.equal(field.technicians[0].source,'Apontamento');
    await assert.rejects(()=>saveFieldLocation('admin',{latitude:-27,longitude:-49,accuracy:10,at:new Date().toISOString()}));
    await saveFieldLocation('tech',{latitude:-27,longitude:-49,accuracy:10,at:new Date().toISOString()});
    field=await fieldMapData('tech');
    assert.equal(field.technicians[0].source,'Acesso ao portal');
    assert.equal(field.technicians[0].latitude,-27);
    await db.exec("UPDATE web_service_operations SET status='awaiting_execution' WHERE schedule_id=1");
    assert.equal((await fieldMapData('tech')).orders[0].status,'overdue');
    await db.exec("UPDATE web_service_operations SET status='completed' WHERE schedule_id=1");
    assert.equal((await fieldMapData('tech')).orders[0].status,'done');
    await assert.rejects(() => scheduleMapData("tech"));
    let data = await scheduleMapData("admin");
    assert.equal(data.schedules.length, 2);
    assert.equal(data.schedules[0].localities.length, 1);
    for (const body of [
      { scheduleId: "1", addressId: "2" },
      { scheduleId: "3", addressId: "1" },
    ])
      await assert.rejects(() =>
        changeScheduleMap(
          { ...body, action: "manual", latitude: -27, longitude: -49 },
          "admin",
        ),
      );
    await changeScheduleMap(
      {
        scheduleId: "1",
        addressId: "1",
        action: "manual",
        latitude: -27,
        longitude: -49,
      },
      "admin",
    );
    data = await scheduleMapData("admin");
    assert(data.schedules.every((s: any) => s.localities[0].latitude === -27));
    await db.exec(
      "UPDATE m8_customer_localities SET street='Rua nova' WHERE company_id=1",
    );
    data = await scheduleMapData("admin");
    assert(data.schedules.every((s: any) => s.localities[0].latitude === null));
    await assert.rejects(() =>
      changeScheduleMap(
        {
          scheduleId: "1",
          addressId: "1",
          action: "manual",
          latitude: NaN,
          longitude: -49,
        },
        "admin",
      ),
    );
    const originalFetch = globalThis.fetch,
      originalKey = process.env.GEOAPIFY_API_KEY;
    try {
      process.env.GEOAPIFY_API_KEY = "test-key";
      let requests = 0;
      globalThis.fetch = async (input) => {
        requests++;
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("street"), "Rua nova");
        assert(!url.searchParams.has("name"));
        assert(!url.searchParams.has("scheduleId"));
        return Response.json({
          results: [
            {
              lat: -27.5,
              lon: -49.5,
              result_type: "street",
              country_code: "br",
              state_code: "SC",
              city: "Aurora",
              rank: { confidence: 0.9 },
            },
          ],
        });
      };
      const body = { scheduleId: "1", addressId: "1", action: "geocode" };
      await changeScheduleMap(body, "admin");
      await changeScheduleMap(body, "admin");
      assert.equal(requests, 1);
      assert.equal(
        (await scheduleMapData("admin")).schedules[0].localities[0].precision,
        "street",
      );
      await db.exec(
        "UPDATE m8_customer_localities SET number='2' WHERE company_id=1",
      );
      globalThis.fetch = async () =>
        Response.json({
          results: [
            {
              lat: -27.5,
              lon: -49.5,
              result_type: "city",
              rank: { confidence: 1 },
            },
          ],
        });
      await assert.rejects(() => changeScheduleMap(body, "admin"), /segurança/);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GEOAPIFY_API_KEY;
      else process.env.GEOAPIFY_API_KEY = originalKey;
    }
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
