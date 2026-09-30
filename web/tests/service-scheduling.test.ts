import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  calendarEnd,
  blankOperation,
  planningStatus,
  effectiveOperationStatus,
  totalHours,
  validateOperation,
} from "../lib/service-scheduling/model";
import { mutateSchedule } from "../lib/service-scheduling/store";
const calendar = {
  id: "standard",
  week: [
    ...[1, 2, 3, 4].flatMap((day) => [
      { day, start: "07:30", end: "12:00" },
      { day, start: "13:00", end: "18:00" },
    ]),
    { day: 5, start: "07:30", end: "12:00" },
  ],
};
test("working calendar skips lunch, Friday afternoon and weekends; statuses and person-hours", () => {
  const d = {
    ...blankOperation(),
    date: "2026-09-28",
    time: "11:30",
    duration: 1,
    responsible: "a",
    support: ["b"],
  };
  assert.equal(calendarEnd(d, calendar), "2026-09-28T16:30:00.000Z");
  assert.equal(
    calendarEnd(
      { ...d, date: "2026-10-02", time: "11:00", duration: 2 },
      calendar,
    ),
    "2026-10-05T11:30:00.000Z",
  );
  assert.equal(
    calendarEnd(
      { ...d, date: "2026-10-01", time: "17:00", duration: 3 },
      calendar,
    ),
    "2026-10-02T12:30:00.000Z",
  );
  assert.equal(totalHours(d), 2);
  assert.equal(planningStatus(blankOperation()), "pending");
  assert.equal(planningStatus({ ...d, time: "" }), "planning");
  assert.equal(planningStatus(d), "scheduled");
  assert.equal(planningStatus({...d,responsible:""}), "planning");
  assert.equal(planningStatus({...d,responsible:"   "}), "planning");
  assert.equal(effectiveOperationStatus("scheduled",{...d,responsible:""}), "planning");
  assert.equal(effectiveOperationStatus("executing",{...d,responsible:""}), "executing");
  const settings = {
      serviceTypes: ["Interno"],
      calendars: [calendar],
      checklists: [],
    },
    users = [{ email: "a", job_title: "Técnico", enabled: true }];
  assert.throws(
    () => validateOperation({ ...d, support: ["a"] }, settings, users),
    /apoio/,
  );
  assert.throws(
    () =>
      validateOperation(
        { ...blankOperation(), description: "x".repeat(41) },
        settings,
        users,
      ),
    /40/,
  );
});
test("scheduling includes once, versions operations, protects execution and records quantities without defaulting blanks to zero", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool,
    query = db.query.bind(db);
  g.historyPool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
    for (const file of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "011_task_kanban",
      "012_manual_tasks",
      "016_task_order_links",
      "022_task_activity_progress",
      "028_service_scheduling",
      "029_order_links",
      "030_service_schedule_visibility",
      "031_schedule_item_sources",
      "037_field_operations",
      "038_time_adjustment_requests",
      "039_material_withdrawals",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + file + ".sql", import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      "CREATE TABLE m8_ordens_servico(company_id integer,id_m8 bigint);INSERT INTO m8_ordens_servico VALUES(1,100);CREATE TABLE m8_os_produtos(company_id integer,ordem_servico_id bigint,id_m8 bigint,esta_excluido boolean);INSERT INTO m8_os_produtos VALUES(1,100,55,false);INSERT INTO web_user_access(email,display_name,job_title,role,updated_by) VALUES('tech@test.com','Técnico','Técnico','user','test'),('other@test.com','Outro','Técnico','user','test');",
    );
    const admin = "guih.waltrick@gmail.com",
      user = "tech@test.com";
    const a = await mutateSchedule(
        { action: "include", company: 1, orderId: "100" },
        user,
      ),
      sid = String(a.schedule.id);
    assert.equal(
      (
        await mutateSchedule(
          { action: "include", company: 1, orderId: "100" },
          user,
        )
      ).schedule.id,
      a.schedule.id,
    );
    let ops = (
      await db.query<any>(
        "SELECT * FROM web_service_operations ORDER BY position",
      )
    ).rows;
    assert.equal(ops.length, 1);
    const added = (await mutateSchedule({action:"add_operation",scheduleId:sid},user)).operation;
    await mutateSchedule({action:"remove_operation",scheduleId:sid,operationId:added.id,version:added.version},user);
    const discarded=(await mutateSchedule({action:'add_operation',scheduleId:sid},admin)).operation;
    await db.query("UPDATE web_service_operations SET document=document||'{\"checklistReturn\":{\"reason\":\"Checklist incorreto\"}}'::jsonb WHERE id=$1",[discarded.id]);
    await db.query('INSERT INTO web_field_material_checks(operation_id,actor) VALUES($1,$2)',[discarded.id,user]);
    await mutateSchedule({action:'remove_operation',scheduleId:sid,operationId:discarded.id,version:discarded.version},admin);
    assert.equal((await db.query('SELECT 1 FROM web_field_material_checks WHERE operation_id=$1',[discarded.id])).rows.length,0);

    assert.equal((await db.query("SELECT * FROM web_service_operations")).rows.length,1);
    assert.equal(ops[0].document.date, "");
    assert.equal(ops[0].sent_at, null);
    const doc = {
      ...ops[0].document,
      description: "Revisão",
      serviceType: "Interno",
      jobTitle: "Técnico",
      responsible: user,
      duration: 2,
      date: "2026-10-02",
    };
    const send = (action: string, extra: any = {}) =>
      mutateSchedule(
        {
          action,
          scheduleId: sid,
          operationId: ops[0].id,
          version: ops[0].version,
          ...extra,
        },
        user,
      );
    ops[0] = (await send("operation", { document: doc })).operation;
    assert.equal(ops[0].status, "planning");
    ops[0] = (
      await send("operation", { document: { ...doc, time: "11:00" } })
    ).operation;
    assert.equal(ops[0].status, "scheduled");
    await assert.rejects(()=>send("dispatch"),e=>(e as Error).constructor.name==="Forbidden");
    ops[0]=(await mutateSchedule({action:"dispatch",scheduleId:sid,operationId:ops[0].id,version:ops[0].version},admin)).operation;
    assert.equal(ops[0].status,"awaiting_execution");assert.ok(ops[0].sent_at);
    // A returned operation accepts a replacement template and starts with empty answers.
    const template={id:'replacement',name:'Checklist corrigido',items:[],stages:[{id:'step',name:'Etapa',fields:[{id:'answer',label:'Verificação',type:'text',required:false}]}]};
    await db.query("UPDATE web_service_schedule_settings SET document=jsonb_set(document,'{checklists}',$1::jsonb)",[JSON.stringify([template])]);
    await db.query("UPDATE web_service_operations SET sent_at=NULL,status='scheduled',document=(document-'checklistRun')||$2::jsonb WHERE id=$1",[ops[0].id,JSON.stringify({checklistReturn:{reason:'Checklist errado'},checked:[]})]);
    ops[0]=(await send('operation',{document:{...doc,time:'11:00',checklistId:'replacement',checked:[]}})).operation;
    assert.equal(ops[0].document.checklistReturn.reason,'Checklist errado');
    ops[0]=(await mutateSchedule({action:'dispatch',scheduleId:sid,operationId:ops[0].id,version:ops[0].version},admin)).operation;
    assert.equal(ops[0].document.checklistRun.template.id,'replacement');
    assert.deepEqual(ops[0].document.checklistRun.stages.step.answers,{});
    assert.equal(ops[0].document.checklistReturn,undefined);
    // Restore the original no-checklist fixture for the remaining lifecycle assertions.
    await db.query("UPDATE web_service_operations SET document=(document-'checklistRun')||'{\"checklistId\":\"\"}'::jsonb WHERE id=$1",[ops[0].id]);


    assert.equal(
      new Date(ops[0].ends_at).toISOString(),
      "2026-10-05T11:30:00.000Z",
    );
    await assert.rejects(
      () =>
        mutateSchedule(
          {
            action: "work_log",
            scheduleId: sid,
            operationId: ops[0].id,
            version: ops[0].version,
            hours: 1,
          },
          "other@test.com",
        ),
      (e) => (e as Error).constructor.name === "Forbidden",
    );
    await assert.rejects(
      () => send("operation", { version: 1, document: doc }),
      /alterada/,
    );
    const usage = (
      await mutateSchedule(
        {
          action: "usage",
          scheduleId: sid,
          itemId: "55",
          version: null,
          withdrawn: 3,
          used: null,
        },
        user,
      )
    ).item;
    assert.equal(usage.used, null);
    await db.exec(`INSERT INTO m8_os_produtos VALUES(2,200,55,false); INSERT INTO web_order_links(company_id,order_id,linked_company_id,linked_order_id,updated_by) VALUES(1,100,2,200,'test');`);
    await mutateSchedule({action:'usage',scheduleId:sid,itemId:'55',item_company:2,item_order:'200',version:null,withdrawn:8,used:2},user);
    const separate=(await db.query<any>('SELECT item_company,withdrawn FROM web_service_item_usage ORDER BY item_company')).rows;
    assert.equal(separate.length,2);assert.equal(Number(separate[0].withdrawn),3);assert.equal(Number(separate[1].withdrawn),8);
    await assert.rejects(()=>mutateSchedule({action:'usage',scheduleId:sid,itemId:'55',item_company:2,item_order:'999',version:null,withdrawn:1,used:0},user),/não pertence/);

    ops[0] = (await send("work_log", { hours: 1.5 })).operation;
    assert.equal(ops[0].status, "executing");
    ops[0] = (await send("finish_partial")).operation;
    assert.equal(ops[0].status, "executing");
    ops[0] = (await send("finish_full")).operation;
    assert.equal(ops[0].status, "awaiting_review");
    const reviewRun={template:{id:'check',name:'Teste',stages:[{id:'s',name:'Etapa',fields:[{id:'f',label:'Resultado',type:'text',required:true}]}]},submission:{at:'2026-09-30T10:00:00Z',by:user},stages:{s:{status:'submitted',answers:{f:'Original'}}}};
    await db.query("UPDATE web_service_operations SET document=document||$2::jsonb WHERE id=$1",[ops[0].id,JSON.stringify({checklistRun:reviewRun})]);
    const corrections={action:'checklist_review_save',scheduleId:sid,operationId:ops[0].id,version:ops[0].version,stages:[{stageId:'s',answers:{f:'Corrigido'},details:{}}]};
    await assert.rejects(mutateSchedule(corrections,user),e=>(e as Error).constructor.name==='Forbidden');
    await assert.rejects(mutateSchedule({...corrections,stages:[...corrections.stages,{stageId:'missing',answers:{},details:{}}]},admin),/Etapa não encontrada/);
    assert.equal((await db.query<any>("SELECT document->'checklistRun'->'stages'->'s'->'answers'->>'f' value FROM web_service_operations WHERE id=$1",[ops[0].id])).rows[0].value,'Original');
    ops[0]=(await mutateSchedule(corrections,admin)).operation;
    assert.equal(ops[0].status,'awaiting_review');assert.equal(ops[0].document.checklistRun.stages.s.answers.f,'Corrigido');
    assert.deepEqual(ops[0].document.checklistRun.submission,reviewRun.submission);
    await assert.rejects(mutateSchedule(corrections,admin),/alterada/);
    await db.query("UPDATE web_service_operations SET document=document-'checklistRun' WHERE id=$1",[ops[0].id]);

    await assert.rejects(
      () => send("review"),
      (e) => (e as Error).constructor.name === "Forbidden",
    );
    ops[0] = (
      await mutateSchedule(
        {
          action: "review",
          scheduleId: sid,
          operationId: ops[0].id,
          version: ops[0].version,
        },
        admin,
      )
    ).operation;
    ops[0] = (
      await mutateSchedule(
        {
          action: "complete",
          scheduleId: sid,
          operationId: ops[0].id,
          version: ops[0].version,
        },
        admin,
      )
    ).operation;
    await assert.rejects(
      () => send("operation", { document: doc }),
      /concluída/,
    );
    await assert.rejects(
      () =>
        db.query(
          "UPDATE web_service_operations SET status='pending' WHERE id=$1",
          [ops[0].id],
        ),
      /concluída/,
    );
    const removed = await mutateSchedule({action:"remove_schedule",company:1,orderId:"100"},user);
    assert.equal(removed.schedule.active,false);
    const restored = await mutateSchedule({action:"include",company:1,orderId:"100"},user);
    assert.equal(restored.schedule.active,true);
    assert.equal(restored.schedule.id,a.schedule.id);
    const preserved = (await db.query<any>("SELECT * FROM web_service_operations")).rows;
    assert.equal(preserved.length,1);
    assert.equal(preserved[0].status,"completed");
  } finally {
    g.historyPool = old;
    await db.close();
  }
});

test('OS summary uses unfinished operations, prioritizes execution and requires all completed', async () => {
  const {scheduleStatus} = await import('../lib/service-scheduling/model');
  assert.equal(scheduleStatus({}), 'pending');
  assert.equal(scheduleStatus({pending:1,completed:2}), 'pending');
  assert.equal(scheduleStatus({pending:1,executing:1}), 'executing');
  assert.equal(scheduleStatus({scheduled:1,awaiting_review:2}), 'scheduled');
  assert.equal(scheduleStatus({completed:3}), 'completed');
});

test('internal notes accept long multiline text and vehicles must exist in settings', async () => {
  const {validateSettings} = await import('../lib/service-scheduling/model');
  const settings=validateSettings({serviceTypes:['Interno'],checklists:[],calendars:[{...calendar,name:'Padrão'}],vehicles:[{id:'van',name:'Van / ABC1D23'}]});
  const note='Observação interna\n'.repeat(15000);
  const result=validateOperation({...blankOperation(),internalNote:note,vehicleId:'van'},settings,[]);
  assert.equal(result.document.internalNote,note);
  assert.equal(result.document.vehicleId,'van');
  assert.throws(()=>validateOperation({...blankOperation(),vehicleId:'missing'},settings,[]),/veículo/);
  assert.throws(()=>validateSettings({...settings,vehicles:[{id:'1',name:'Van'},{id:'2',name:'van'}]}),/duplicidades/);
});

test('calendar exceptions skip holidays and override weekly hours, rejecting overlapping periods',async()=>{
 const {validateSettings}=await import('../lib/service-scheduling/model');
 const c={...calendar,name:'Padrão',exceptions:[{name:'Feriado',startDate:'2026-09-28',endDate:'2026-09-28',hours:[]}]};
 const settings={serviceTypes:['Interno'],checklists:[],calendars:[c]};
 validateSettings(settings);
 assert.equal(calendarEnd({...blankOperation(),date:'2026-09-28',time:'07:30',duration:1},c),'2026-09-29T11:30:00.000Z');
 const saturday={...calendar,exceptions:[{name:'Plantão',startDate:'2026-10-03',endDate:'2026-10-03',hours:[{start:'08:00',end:'10:00'}]}]};
 assert.equal(calendarEnd({...blankOperation(),date:'2026-10-03',time:'08:00',duration:2},saturday),'2026-10-03T13:00:00.000Z');
 assert.throws(()=>validateSettings({...settings,calendars:[{...c,exceptions:[...c.exceptions,...c.exceptions]}]}),/sobrepor/);
 assert.throws(()=>validateSettings({...settings,calendars:[{...c,exceptions:[{...c.exceptions[0],startDate:'2026-02-30'}]}]}),/válidos/);
});

test('24-hour calendar has no minute gap at midnight and accepts full-day exceptions',async()=>{
 const {validateSettings}=await import('../lib/service-scheduling/model');
 const c={id:'standard',name:'24 horas',week:Array.from({length:7},(_,day)=>({day,start:'00:00',end:'24:00'})),exceptions:[]};
 validateSettings({serviceTypes:['Interno'],checklists:[],calendars:[c]});
 assert.equal(calendarEnd({...blankOperation(),date:'2026-09-28',time:'00:00',duration:24},c),'2026-09-29T03:00:00.000Z');
 assert.equal(calendarEnd({...blankOperation(),date:'2026-09-28',time:'23:30',duration:25},c),'2026-09-30T03:30:00.000Z');
 validateSettings({serviceTypes:['Interno'],checklists:[],calendars:[{...c,exceptions:[{name:'Plantão',startDate:'2026-10-03',endDate:'2026-10-03',hours:[{start:'00:00',end:'24:00'}]}]}]});
 assert.throws(()=>validateSettings({serviceTypes:['Interno'],checklists:[],calendars:[{...c,week:[{day:1,start:'00:00',end:'00:00'}]}]}),/Horários/);
});

test("operation role comes from responsible, overriding manual values and clearing when unassigned", () => {
 const settings = {serviceTypes: [], calendars: [calendar], checklists: []};
 const users = [{email:"a",job_title:"Técnico",enabled:true},{email:"b",job_title:"Supervisor",enabled:true},{email:"c",job_title:null,enabled:true}];
 for (const [responsible, expected] of [["a","Técnico"],["b","Supervisor"],["c",""],["",""]]) {
  const result = validateOperation({...blankOperation(),responsible,jobTitle:"Cargo manual"},settings,users);
  assert.equal(result.document.jobTitle,expected);
 }
});
