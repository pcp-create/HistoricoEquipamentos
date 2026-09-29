import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fieldAction, fieldData } from "../lib/service-scheduling/field-store";
import {
  locationOf,
  sessionTotals,
  validatePauseReasons,
} from "../lib/service-scheduling/field-model";
test("location, pause limits and running/paused totals reject invalid inputs", () => {
  assert.throws(() => locationOf(null), /localização/);
  assert.throws(() =>
    locationOf({
      latitude: 91,
      longitude: 0,
      accuracy: 1,
      at: new Date().toISOString(),
    }),
  );
  assert.throws(() =>
    locationOf({ latitude: 0, longitude: 0, accuracy: 1, at: "2020-01-01" }),
  );
  assert.throws(() =>
    validatePauseReasons([{ id: "a", name: "Pausa", minutes: 0 }]),
  );
  assert.deepEqual(
    validatePauseReasons([{ id: "a", name: "Pausa", minutes: 15 }]),
    [{ id: "a", name: "Pausa", minutes: 15 }],
  );
  const session = {
    state: "paused",
    segment_at: "2026-01-01T10:00:00Z",
    active_seconds: 3600,
    pause_seconds: 60,
  };
  assert.deepEqual(sessionTotals(session, Date.parse("2026-01-01T10:10:00Z")), {
    active: 3600,
    pause: 660,
  });
});
test("field actions enforce dispatch, own assignment, material review, shared versions, GPS and timer lifecycle", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  g.historyPool = {
    query: db.query.bind(db),
    connect: async () => ({ query: db.query.bind(db), release() {} }),
  };
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
    for (const name of [
      "008_administration",
      "009_employees",
      "028_service_scheduling",
      "029_order_links",
      "030_service_schedule_visibility",
      "031_schedule_item_sources",
      "037_field_operations",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + name + ".sql", import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text,cliente_id bigint,observacao text);
   CREATE TABLE m8_customer_directory(company_id integer,person_id bigint,payload jsonb);
   CREATE TABLE m8_os_produtos(company_id integer,ordem_servico_id bigint,id_m8 bigint,produto_id bigint,produto_nome text,quantidade numeric,unidade_nome text,esta_excluido boolean,aprovado text);
   CREATE TABLE integracao_m8_os_sync(company_id integer,ordem_servico_id bigint,finalized boolean,last_detail_at timestamptz);
   CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,serial text,present boolean);
   CREATE TABLE m8_order_equipment_links(company_id integer,order_id bigint,equipment_id bigint,stale boolean);
   INSERT INTO m8_ordens_servico VALUES(1,100,100,'Cliente A','Compressor',1,'Observação');
   INSERT INTO m8_os_produtos VALUES(1,100,55,11908,'Peça',2,'UN',false,'Sim');
   INSERT INTO integracao_m8_os_sync VALUES(1,100,false,now());
   INSERT INTO web_user_access(email,display_name,role,updated_by) VALUES('tech','Técnico','user','test'),('helper','Apoio','user','test'),('outsider','Outro','user','test');
   UPDATE web_service_schedule_settings SET document=document||'{"pauseReasons":[{"id":"rest","name":"Descanso","minutes":15}],"vehicles":[{"id":"v1","name":"Veículo 1"}]}'::jsonb;`);
    const schedule = (
      await db.query<any>(
        "INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'test') RETURNING *",
      )
    ).rows[0];
    const id = randomUUID(),
      other = randomUUID();
    await db.query(
      "INSERT INTO web_service_operations(id,schedule_id,position,document,status,updated_by) VALUES($1,$2,1,$3,'scheduled','test'),($4,$2,2,$3,'scheduled','test')",
      [
        id,
        schedule.id,
        JSON.stringify({
          responsible: "tech",
          support: ["helper"],
          vehicleId: "v1",
          date: "2026-10-01",
          time: "08:00",
        }),
        other,
      ],
    );
    const location = () => ({
      latitude: -27,
      longitude: -49,
      accuracy: 10,
      at: new Date().toISOString(),
    });
    const act = (action: string, extra: any = {}, actor = "tech") =>
      fieldAction(
        {
          action,
          operationId: id,
          requestId: randomUUID(),
          location: location(),
          ...extra,
        },
        actor,
      );
    const parts = (withdrawn: any, version: any) => ({
      items: [
        { id_m8: "55", item_company: 1, item_order: "100", withdrawn, version },
      ],
    });
    assert.equal((await fieldData("tech")).rows?.length, 0);
    await assert.rejects(
      act("materials", parts(1, null)),
      (e) => (e as Error).constructor.name === "Forbidden",
    );
    await db.exec("UPDATE web_service_operations SET sent_at=now()");
    assert.equal((await fieldData("tech")).rows?.length, 2);
    assert.equal((await fieldData("outsider")).rows?.length, 0);
    await assert.rejects(
      fieldData("outsider", id),
      (e) => (e as Error).constructor.name === "Forbidden",
    );
    await assert.rejects(act("materials", parts(1,null)), /observações internas/);
    await act("info_read");
    assert.equal((await fieldData("tech",id)).infoRead,true);
    assert.equal((await fieldData("helper",id)).infoRead,false);
    await act("info_read",{},"helper");
    await act("info_read",{operationId:other});
    await assert.rejects(act("start_work"), /Confira/);
    await assert.rejects(
      act("materials", { ...parts(1, null), location: null }),
      /localização/,
    );
    await db.exec("UPDATE integracao_m8_os_sync SET last_detail_at=NULL");
    await assert.rejects(
      act("materials", parts(null, null)),
      /importação completa/,
    );
    await db.exec("UPDATE integracao_m8_os_sync SET finalized=false,last_detail_at=now()");
    // An explicitly removed link leaves a row with null targets in production.
    await db.exec("INSERT INTO web_order_links(company_id,order_id,linked_company_id,linked_order_id,updated_by) VALUES(1,100,NULL,NULL,'test')");
    assert.equal((await fieldData("tech", id)).materials?.complete, true);
    await act("materials", parts(1, null));
    const run={template:{id:'test',name:'Teste',stages:[{id:'s1',name:'Primeira',fields:[{id:'f1',label:'Texto',type:'text'}]},{id:'s2',name:'Segunda',fields:[{id:'f2',label:'Texto',type:'text',required:true}]}]},stages:{s1:{status:'released',answers:{}},s2:{status:'released',answers:{}}}};
    await db.query("UPDATE web_service_operations SET document=document||$2::jsonb WHERE id=$1",[id,JSON.stringify({checklistId:'test',checklistRun:run})]);
    const beforeSave:any=await fieldData('tech',id);
    await act('report_save',{version:beforeSave.operation.version,stages:[{stageId:'s1',answers:{f1:'Um'}},{stageId:'s2',answers:{f2:'Dois'}}]});
    const afterSave:any=await fieldData('tech',id);
    assert.equal(afterSave.operation.document.checklistRun.stages.s1.answers.f1,'Um');
    assert.equal(afterSave.operation.document.checklistRun.stages.s2.answers.f2,'Dois');
    await assert.rejects(act('report_save',{version:afterSave.operation.version,stages:[{stageId:'s1',answers:{f1:'Não persistir'}},{stageId:'inexistente',answers:{}}]}));
    assert.equal((await fieldData('tech',id) as any).operation.document.checklistRun.stages.s1.answers.f1,'Um');
    await act('report_send_partial',{version:afterSave.operation.version,stages:[{stageId:'s2',answers:{f2:''}}]});
    const partial:any=await fieldData('tech',id);
    assert.equal(partial.reportSubmission,null);
    assert.ok(partial.operation.document.checklistRun.partialSubmission.at);
    assert.equal(partial.operation.document.checklistRun.stages.s2.status,'released');
    await assert.rejects(act('report_send',{version:partial.operation.version}),/Texto/);
    await act('report_send',{version:partial.operation.version,stages:[{stageId:'s2',answers:{f2:'Dois'}}]});

    const sent:any=await fieldData('tech',id);
    assert.equal(sent.reportSubmission.by,'tech');
    assert.ok(sent.reportSubmission.at);
    assert.ok(sent.reportSubmission.name);
    assert.equal(sent.operation.status,'executing');
    await assert.rejects(act('report_send',{version:sent.operation.version}),/planejador/);
    await assert.rejects(act('report_save',{version:sent.operation.version,stages:[]}),/planejador/);
    await assert.rejects(act('checklist_save',{version:sent.operation.version,stageId:'s1',answers:{f1:'Alterado'}}),/planejador/);
    const {updateChecklist}=await import('../lib/service-scheduling/checklist-store');
    await assert.rejects(updateChecklist(db,{action:'checklist_reopen',stageId:'s1'},sent.operation,{}, {},'tech',false),/administradores/);
    await updateChecklist(db,{action:'checklist_reopen',stageId:'s1'},sent.operation,{}, {},'planner',true);
    const reopened:any=await fieldData('tech',id);
    assert.equal(reopened.reportSubmission,null);
    await act('report_save',{version:reopened.operation.version,stages:[{stageId:'s1',answers:{f1:'Corrigido'}}]});
    const corrected:any=await fieldData('tech',id);
    await act('report_send',{version:corrected.operation.version});
    assert.equal((await fieldData('tech',id) as any).operation.document.checklistRun.stages.s1.answers.f1,'Corrigido');
    const {reopenReport}=await import('../lib/service-scheduling/checklist-store');
    const latest:any=await fieldData('tech',id);
    await assert.rejects(reopenReport(db,latest.operation,'tech',false),/planejador/);
    await db.query("UPDATE web_service_operations SET status='awaiting_review' WHERE id=$1",[id]);
    const toReturn:any=await fieldData('tech',id);
    await db.query("INSERT INTO web_user_access(email,display_name,role,updated_by) VALUES('planner','Planejador','admin','test')");
    const {mutateSchedule}=await import('../lib/service-scheduling/store');
    await assert.rejects(mutateSchedule({action:'report_reopen',scheduleId:String(schedule.id),operationId:id,version:toReturn.operation.version-1},'planner'),/outro usuário/);
    await mutateSchedule({action:'report_reopen',scheduleId:String(schedule.id),operationId:id,version:toReturn.operation.version},'planner');
    const returned:any=await fieldData('tech',id);
    assert.equal(returned.operation.status,'executing');
    assert.equal(returned.reportSubmission,null);
    assert.ok(Object.values(returned.operation.document.checklistRun.stages).every((stage:any)=>stage.status==='released'));
    assert.equal(returned.operation.document.checklistRun.submissionHistory.length,1);
    await assert.rejects(reopenReport(db,{...latest.operation,status:'reviewed'},'planner',true),/revisados/);
    let detail: any = await fieldData("helper", id);
    assert.equal(detail.checked, false);
    assert.equal(detail.materials.items[0].usage.position, 1);
    assert.equal(Number(detail.materials.items[0].usage.withdrawn), 1);
    await assert.rejects(
      act("materials", parts(2, null), "helper"),
      /Outro técnico/,
    );
    await act("materials", parts(1, 1), "helper");
    await act("materials", { ...parts(1, 1), operationId: other });
    const requestId = randomUUID();
    await act("start_work", { requestId });
    await act("start_work", { requestId });
    assert.equal(
      (await db.query("SELECT * FROM web_field_sessions")).rows.length,
      1,
    );
    await assert.rejects(act("start_work", { operationId: other }), /Finalize/);
    let session = (
      await db.query<any>(
        "SELECT * FROM web_field_sessions WHERE state<>'finished'",
      )
    ).rows[0];
    await db.exec(
      "UPDATE web_field_sessions SET segment_at=now()-interval '1 hour'",
    );
    await assert.rejects(
      act("pause", { sessionId: session.id, reasonId: "missing" }),
      /causa/,
    );
    await act("pause", { sessionId: session.id, reasonId: "rest" });
    await assert.rejects(act("finish_full"), /apontamentos/);
    await db.exec(
      "UPDATE web_field_sessions SET segment_at=now()-interval '15 minutes'",
    );
    await act("pause_ack", { sessionId: session.id });
    await act("resume", { sessionId: session.id });
    await act("stop", { sessionId: session.id });
    session = (await db.query<any>("SELECT * FROM web_field_sessions")).rows[0];
    assert.equal(session.state, "finished");
    assert.ok(Number(session.active_seconds) >= 3600);
    assert.ok(Number(session.pause_seconds) >= 900);
    const event = (
      await db.query<any>(
        "SELECT * FROM web_service_operation_events WHERE action='work_log'",
      )
    ).rows[0];
    assert.ok(Number(event.hours) >= 1 && Number(event.hours) < 1.02);
    await act("start_travel", { odometer: 1000 });
    session = (
      await db.query<any>(
        "SELECT * FROM web_field_sessions WHERE state<>'finished'",
      )
    ).rows[0];
    await assert.rejects(
      act("stop", { sessionId: session.id, odometer: 999 }),
      /menor/,
    );
    await act("stop", { sessionId: session.id, odometer: 1010 });
    await assert.rejects(act("finish_full", {}, "helper"), /responsável/);
    await act("finish_partial");
    await act("start_work");
    session = (
      await db.query<any>(
        "SELECT * FROM web_field_sessions WHERE state<>'finished'",
      )
    ).rows[0];
    await act("stop", { sessionId: session.id });
    await act("finish_full");
    await assert.rejects(act("start_work"), /revisão/);
    const events = (await db.query<any>("SELECT * FROM web_field_events")).rows;
    assert.ok(events.length > 10);
    assert.ok(events.every((e) => e.latitude === -27 && e.longitude === -49));
    // No materials is still a real, recorded confirmation.
    await db.exec("DELETE FROM m8_os_produtos");
    await act("materials", { operationId: other, items: [] });
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
