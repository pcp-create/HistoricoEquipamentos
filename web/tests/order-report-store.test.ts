import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  loadOrderReport,
  validateOrderReportSelection,
} from "../lib/service-scheduling/order-report-store";
import {attachSummaryReport} from "../lib/service-scheduling/summary-attachment";
import {readFileSync} from "node:fs";
import sharp from "sharp";
const one = "10000000-0000-4000-8000-000000000001",
  two = "20000000-0000-4000-8000-000000000002";
test("unified export validates selection, scopes data to the OS, and checks current review and photo ownership", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  const originalFetch=globalThis.fetch;
  const keys=["M8_API_URL","M8_TENANT","M8_USERNAME","M8_PASSWORD"],env=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  g.historyPool = {
    connect: async () => ({ query: db.query.bind(db), release() {} }),
  };
  try {
    await db.exec(`CREATE TABLE web_user_access(email text,role text,enabled boolean,display_name text);
   INSERT INTO web_user_access VALUES('admin','admin',true,'Planejador'),('tech','user',true,'Técnico'),('disabled','admin',false,'Desativado');
   CREATE TABLE web_service_schedule_settings(id integer,document jsonb);
   CREATE TABLE web_service_schedules(id bigint,company_id integer,order_id bigint,active boolean DEFAULT true);
   INSERT INTO web_service_schedules(id,company_id,order_id) VALUES(1,1,100),(2,2,100);
   CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,cliente_nome text);
   INSERT INTO m8_ordens_servico VALUES(1,100,14877,'Cliente correto'),(2,100,99,'Outra empresa');
   CREATE TABLE web_service_operations(id uuid,schedule_id bigint,position integer,status text,document jsonb);
   CREATE TABLE web_field_sessions(id text,operation_id uuid,actor text);
   CREATE TABLE web_field_events(id bigint,operation_id uuid,actor text,action text,created_at timestamptz);
   CREATE TABLE web_service_operation_events(id bigint,operation_id uuid,actor text);
   CREATE TABLE web_service_checklist_photos(id bigint,operation_id uuid,content bytea);`);
    const run = {
      template: {
        name: "Teste",
        stages: [
          {
            id: "s",
            name: "Fotos",
            fields: [{ id: "photo", label: "Foto", type: "photo" }],
          },
        ],
      },
      stages: { s: { status: "submitted", answers: { photo: ["1"] } } },
    };
    await db.query(
      "INSERT INTO web_service_operations VALUES($1,1,1,'reviewed',$3),($2,2,1,'completed',$3)",
      [one, two, JSON.stringify({ responsible: "tech", checklistRun: run })],
    );
    await db.query(
      "INSERT INTO web_service_checklist_photos VALUES(1,$1,$2)",
      [one,await sharp({create:{width:10,height:10,channels:3,background:'#ffffff'}}).png().toBuffer()],
    );
    const body = { scheduleId: "1", operationIds: [one], mode: "complete" };
    assert.throws(() => validateOrderReportSelection({...body,includeTimeline:"false"}), /linha do tempo/);
    assert.equal(validateOrderReportSelection({...body,mode:"summary"}).includeTimeline,false);
    assert.equal(validateOrderReportSelection({...body,mode:"summary",includeTimeline:true}).includeTimeline,true);

    assert.throws(
      () => validateOrderReportSelection({ ...body, operationIds: [] }),
      /Selecione/,
    );
    assert.throws(
      () => validateOrderReportSelection({ ...body, operationIds: [one, one] }),
      /repetidas/,
    );
    assert.throws(
      () => validateOrderReportSelection({ ...body, mode: "unsafe" }),
      /Tipo/,
    );
    assert.throws(
      () =>
        validateOrderReportSelection({ ...body, operationIds: ["invalid"] }),
      /Selecione/,
    );
    for (const user of ["disabled", "unknown"])
      await assert.rejects(loadOrderReport(body, user));
    assert.ok((await loadOrderReport(body, "tech")).model);
    await assert.rejects(
      loadOrderReport({ ...body, operationIds: [one, two] }, "admin"),
      /somente operações desta OS/,
    );
    await db.exec("ALTER TABLE web_service_operations ADD COLUMN sent_at timestamptz DEFAULT now()");
    const third="30000000-0000-4000-8000-000000000003";
    await db.query("INSERT INTO web_service_operations(id,schedule_id,position,status,document) VALUES($1,1,2,'executing',$2)",[third,JSON.stringify({responsible:'another-tech',description:'Outro técnico, sem checklist'})]);
    const fourth="40000000-0000-4000-8000-000000000004";
    await db.query("INSERT INTO web_service_operations(id,schedule_id,position,status,document) VALUES($1,1,3,'executing',$2)",[fourth,JSON.stringify({responsible:'another-tech',description:'Relatório do outro técnico',checklistRun:{template:{name:'Teste',stages:[{id:'s',name:'Serviço',fields:[{id:'text',label:'Descrição',type:'text'}]}]},stages:{s:{status:'released',answers:{text:'Manutenção realizada por outro técnico'}}}}})]);
    const portal=await loadOrderReport({scheduleId:'1',mode:'complete'},'tech',true);
    assert.equal(portal.model.chapters.length,3);
    assert.ok(JSON.stringify(portal.model).includes("Manutenção realizada por outro técnico"));
    assert.ok(portal.model.chapters.some(c=>c.id===third));
    assert.ok(!portal.model.chapters.some(c=>c.id===two));
    assert.ok(portal.model.report.some(s=>s.id==='timeline'));
    assert.match(portal.model.title,/PRÉVIA/);
    await assert.rejects(loadOrderReport({scheduleId:'1',mode:'budget'},'tech',true));
    await assert.rejects(loadOrderReport({scheduleId:'1'},'unknown',true));
    await db.query("DELETE FROM web_service_operations WHERE id=ANY($1::uuid[])",[[third,fourth]]);
    const result = await loadOrderReport(body, "admin");
    assert.equal(result.model.order, "14877");
    assert.equal(result.photos.length, 1);
    assert.equal(result.model.chapters.length, 1);
    assert.ok(!JSON.stringify(result.model).includes("Outra empresa"));
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_access_events(event text,email text,actor text,details jsonb)");
    await db.exec(readFileSync('sql/096_order_attachments.sql','utf8'));
    for(const k of keys)process.env[k]=k==='M8_API_URL'?'https://erp.test':'fixture';
    let uploads=0;
    globalThis.fetch=async(url:any,init:any)=>{
      if(String(url).endsWith('/auth/token'))return Response.json({data:{token:'test-token'}});
      assert.equal(String(url),'https://erp.test/v1/assistenciatecnica/ordemservico/100/anexo');
      const body=JSON.parse(init.body);assert.match(body.nome,/^OS 14877 - Cliente correto/);
      assert.ok(Buffer.from(body.arquivo,'base64').subarray(0,4).equals(Buffer.from('%PDF')));
      uploads++;return Response.json({data:{id:123}});
    };
    await assert.rejects(attachSummaryReport({scheduleId:'1'},'disabled'));
    const attached=await attachSummaryReport({scheduleId:'1'},'admin');assert.equal(attached.id,'123');
    assert.equal((await attachSummaryReport({scheduleId:'1'},'admin')).alreadySent,true);
    assert.equal(uploads,1,'repeat saves must not duplicate the generated PDF');
    await db.query(
      "UPDATE web_service_operations SET status='awaiting_review' WHERE id=$1",
      [one],
    );
    await assert.rejects(attachSummaryReport({scheduleId:"1"},"admin"),/revisão de todas/);
    assert.equal(uploads,1);
    const preliminary = await loadOrderReport({...body, preliminary:false}, "admin");
    assert.equal(preliminary.model.preliminary, true);
    assert.equal(preliminary.model.chapters.length, 1);
    assert.equal(result.model.preliminary, false);
    await db.query(
      "UPDATE web_service_operations SET status='reviewed' WHERE id=$1",
      [one],
    );
    await db.query("UPDATE web_service_checklist_photos SET operation_id=$1", [
      two,
    ]);
    await assert.rejects(loadOrderReport(body, "admin"), /fotos indisponíveis/);
    await db.query(
      "UPDATE web_service_operations SET document='{}' WHERE id=$1",
      [one],
    );
    await assert.rejects(
      loadOrderReport(body, "admin"),
      /não possui relatório/,
    );
  } finally {
    globalThis.fetch=originalFetch;
    for(const k of keys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
    g.historyPool = old;
    await db.close();
  }
});
