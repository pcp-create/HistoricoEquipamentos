import {recallOperation} from "../lib/service-scheduling/recall-operation";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {mutateSchedule} from "../lib/service-scheduling/store";
import {claimNotifications} from "../lib/tasks/notifications";
import { handoffOperation } from "../lib/service-scheduling/workflow";
import { releaseSchedule } from "../lib/service-scheduling/release";
import { prepareCustomerDelivery } from "../lib/service-scheduling/customer-delivery";
import {
  claimServiceMessages,
  acknowledgeServiceMessage,
} from "../lib/service-scheduling/notifications";
import { createTask, updateTask } from "../lib/tasks/store";
import {
  billingMaterialOwner,
  createBillingMaterialTask,
} from "../lib/warehouse/billing-material-task";
import {
  photoLimit,
  validateAlertComments,
} from "../lib/service-scheduling/checklists";
test("NOK requires a photo and identification comment even without configured photos", () => {
  const field = {
      id: "filter",
      label: "Filtro",
      type: "flag2",
      required: true,
      maxPhotos: 0,
      alertOptions: [],
    },
    stage = { id: "s", name: "Inspeção", fields: [field] };
  assert.ok(photoLimit(field) > 0);
  assert.throws(
    () => validateAlertComments(stage, { filter: "NOK" }, {}),
    /comentário/,
  );
  assert.throws(
    () =>
      validateAlertComments(
        stage,
        { filter: "NOK" },
        { filter: { comment: "Substituir ref. 123" } },
      ),
    /foto/,
  );
  assert.doesNotThrow(() =>
    validateAlertComments(
      stage,
      { filter: "NOK" },
      { filter: { comment: "Substituir ref. 123", photos: ["1"] } },
    ),
  );
  assert.doesNotThrow(() => validateAlertComments(stage, { filter: "OK" }, {}));
});
test("execution handoffs preserve one task; releases, customer sends and approval corrections validate and deduplicate", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool,
    query = db.query.bind(db);
  g.historyPool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
    for (const name of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "011_task_kanban",
      "012_manual_tasks",
      "016_task_order_links",
      "018_task_assignment_reason",
      "022_task_activity_progress",
      "024_task_stages",
      "027_task_stage_assignment",
      "028_service_scheduling",
      "029_order_links",
      "030_service_schedule_visibility",
      "037_field_operations",
      "038_time_adjustment_requests",
      "017_task_reminders",
      "041_task_completion_notifications",
      "042_restricted_tasks",
      "044_task_followers",
      "073_task_approvals",
      "093_service_execution_workflow",
    ])
      await db.exec(readFileSync("sql/" + name + ".sql", "utf8"));
    await db.exec(`CREATE TABLE m8_ordens_servico(company_id int,id_m8 bigint,numero_sequencia bigint,cliente_nome text,equipamento text,situacao_nome text);
 INSERT INTO m8_ordens_servico VALUES(1,100,15128,'Cliente','Compressor','COBRANÇA A.T.');
 CREATE TABLE m8_order_equipment_links(company_id int,order_id bigint,equipment_id bigint,stale boolean);
 CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,present boolean);
 CREATE TABLE web_service_checklist_photos(id bigint,operation_id uuid,content bytea);
 INSERT INTO web_user_access(email,display_name,phone,role,job_title,updated_by) VALUES('planner@test.com','Planejador','5547999999999','user','Planejador','test'),('tech@test.com','Técnico','5547999999998','user','Técnico','test'),('budget@test.com','Orçamentista','5547999999997','user','Orçamentista','test');
 INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES(1,100,'planner@test.com');`);
    const schedule = (await query<any>("SELECT * FROM web_service_schedules"))
        .rows[0],
      id = randomUUID();
    const run = {
      template: {
        id: "c",
        name: "Inspeção",
        items: [],
        stages: [
          {
            id: "s",
            name: "Inspeção",
            fields: [
              { id: "t", label: "Relato", type: "text", internalNote: true },
            ],
          },
        ],
      },
      stages: {
        s: {
          status: "submitted",
          answers: { t: "Serviço realizado" },
          details: { t: { internalNote: "Custo interno" } },
        },
      },
      submission: { at: new Date().toISOString(), by: "tech@test.com" },
    };
    await query(
      "INSERT INTO web_service_operations(id,schedule_id,position,document,status,updated_by,sent_at) VALUES($1,1,1,$2,'awaiting_execution','planner@test.com',now())",
      [
        id,
        JSON.stringify({
          responsible: "tech@test.com",
          description: "Manutenção preventiva",
          checklistId: "c",
          checklistRun: run,
        }),
      ],
    );
    const op = () =>
      query<any>("SELECT * FROM web_service_operations WHERE id=$1", [id]).then(
        (r) => r.rows[0],
      );
    const taskId = await handoffOperation(
      db,
      await op(),
      schedule,
      "planner@test.com",
      "execution",
    );
    assert.equal(
      (
        await query<any>("SELECT assigned_to FROM web_tasks WHERE id=$1", [
          taskId,
        ])
      ).rows[0].assigned_to,
      "tech@test.com",
    );
    // Recalling a sent operation preserves data, moves its task to planning and hides it from the portal.
    await assert.rejects(async()=>recallOperation(db,await op(),'planner@test.com',{confirmReturn:true,reason:'Ajuste'}),/revisão/);
    await db.exec('BEGIN');
    const recallBefore=await op();
    const draftRun=structuredClone(recallBefore.document.checklistRun);delete draftRun.submission;
    draftRun.stages.s.status='released';
    recallBefore.document={...recallBefore.document,checklistRun:draftRun};
    await query('UPDATE web_service_operations SET document=$2 WHERE id=$1',[id,JSON.stringify(recallBefore.document)]);
    await assert.rejects(()=>recallOperation(db,recallBefore,'planner@test.com',{reason:'Ajuste'}),/Confirme/);
    await assert.rejects(()=>recallOperation(db,recallBefore,'planner@test.com',{confirmReturn:true,reason:' '}),/motivo/);
    const activeSession=randomUUID();
    await query("INSERT INTO web_field_sessions(id,operation_id,actor,kind,state) VALUES($1,$2,'tech@test.com','work','running')",[activeSession,id]);
    await assert.rejects(()=>recallOperation(db,recallBefore,'planner@test.com',{confirmReturn:true,reason:'Ajuste'}),/apontamentos ativos/);
    await query("UPDATE web_field_sessions SET state='finished',finished_at=now() WHERE id=$1",[activeSession]);
    const recalled=await recallOperation(db,recallBefore,'planner@test.com',{confirmReturn:true,reason:'Ajustar programação'});
    assert.equal(recalled.sent_at,null);assert.equal(recalled.version,recallBefore.version+1);
    assert.deepEqual(recalled.document.checklistRun,draftRun);
    assert.equal(recalled.document.checklistReturn.reason,'Ajustar programação');
    assert.equal((await query<any>('SELECT assigned_to FROM web_tasks WHERE id=$1',[taskId])).rows[0].assigned_to,'planner@test.com');
    assert.equal((await query('SELECT * FROM web_service_operations WHERE id=$1 AND sent_at IS NOT NULL',[id])).rows.length,0);
    await assert.rejects(()=>recallOperation(db,recalled,'planner@test.com',{confirmReturn:true,reason:'Repetido'}),/ainda não foi enviada/);
    await db.exec('ROLLBACK');
    // Reassignment after dispatch requires confirmation and preserves synchronized answers.
    await query("UPDATE web_service_schedule_settings SET document=jsonb_set(document,'{checklists}',$1::jsonb)",[JSON.stringify([run.template])]);
    const beforeReassignment=await op();
    const change={action:'operation',scheduleId:String(schedule.id),operationId:id,version:beforeReassignment.version,document:{...beforeReassignment.document,responsible:'budget@test.com'}};
    await assert.rejects(()=>mutateSchedule(change,'planner@test.com'),/Confirme/);
    const reassigned=(await mutateSchedule({...change,confirmResponsibleChange:true},'planner@test.com')).operation;
    assert.equal(reassigned.document.responsible,'budget@test.com');
    assert.deepEqual(reassigned.document.checklistRun,beforeReassignment.document.checklistRun);
    assert.equal((await query<any>('SELECT assigned_to FROM web_tasks WHERE id=$1',[taskId])).rows[0].assigned_to,'budget@test.com');
    await mutateSchedule({...change,version:reassigned.version,document:{...reassigned.document,responsible:'tech@test.com'},confirmResponsibleChange:true},'planner@test.com');
    // The notice for the temporarily assigned person must not be delivered after removal.
    await query("DELETE FROM web_service_notifications WHERE recipient='budget@test.com'");
    // Six operations for the same technician produce a single OS WhatsApp notice.
    await db.exec('BEGIN');
    for(let position=2;position<=6;position++){
      const extra=(await query<any>("INSERT INTO web_service_operations(id,schedule_id,position,document,status,updated_by,sent_at) VALUES($1,1,$2,$3,'awaiting_execution','planner@test.com',now()) RETURNING *",[randomUUID(),position,JSON.stringify({responsible:'tech@test.com',description:'Operação adicional'})])).rows[0];
      await handoffOperation(db,extra,schedule,'planner@test.com','execution');
    }
    assert.equal((await query("SELECT * FROM web_tasks")).rows.length,6);
    assert.equal((await query("SELECT * FROM web_service_notifications WHERE source_key LIKE 'schedule-dispatch:%'")).rows.length,1);
    assert.equal((await query("SELECT * FROM web_task_notifications")).rows.length,0,'no per-operation or follower WhatsApp');
    // Another technician on the same OS receives their own single notice.
    const different={...await op(),id:randomUUID(),position:7,document:{responsible:'budget@test.com'}};
    await query("INSERT INTO web_service_operations(id,schedule_id,position,document,status,updated_by,sent_at) VALUES($1,1,7,$2,'awaiting_execution','planner@test.com',now())",[different.id,JSON.stringify(different.document)]);
    await handoffOperation(db,different,schedule,'planner@test.com','execution');
    assert.equal((await query("SELECT * FROM web_service_notifications WHERE source_key LIKE 'schedule-dispatch:%'")).rows.length,2);
    await db.exec('ROLLBACK');
    const osNotices=await claimServiceMessages();
    assert.equal(osNotices.length,1);assert.equal(osNotices[0].number,'5547999999998');
    assert.match(osNotices[0].text,/OS 15128/);assert.doesNotMatch(osNotices[0].text,/TAR-|Operação 1/);
    await acknowledgeServiceMessage(osNotices[0].id.slice(8),osNotices[0].token);
    await handoffOperation(db,await op(),schedule,'planner@test.com','execution');
    assert.equal((await claimServiceMessages()).length,0,'resending other operations must not repeat the OS notice');
    await query(
      "UPDATE web_service_operations SET status='awaiting_review' WHERE id=$1",
      [id],
    );
    assert.equal(
      await handoffOperation(
        db,
        await op(),
        schedule,
        "tech@test.com",
        "review",
      ),
      taskId,
    );
    assert.equal(
      (
        await query<any>("SELECT assigned_to FROM web_tasks WHERE id=$1", [
          taskId,
        ])
      ).rows[0].assigned_to,
      "planner@test.com",
    );
    assert.equal((await query("SELECT * FROM web_task_notifications")).rows.length,0);
    await query("INSERT INTO web_task_notifications(task_id,task_version,recipient) SELECT id,version,assigned_to FROM web_tasks WHERE id=$1",[taskId]);
    assert.deepEqual(await claimNotifications('https://rjcompressores.app'),[],'legacy operation and planner/follower copies are not delivered');
    assert.equal((await query("SELECT * FROM web_tasks")).rows.length, 1);
    await assert.rejects(
      releaseSchedule(
        db,
        "1",
        "planner@test.com",
        "billing",
        "budget@test.com",
      ),
      /Revise todas/,
    );
    const request = {
      scheduleId: "1",
      phone: "5547999999999",
      requestId: randomUUID(),
    };
    await assert.rejects(
      prepareCustomerDelivery(db, request, "planner@test.com"),
      /Conclua a revisão/,
    );
    await query(
      "UPDATE web_service_operations SET status='reviewed' WHERE id=$1",
      [id],
    );
    await handoffOperation(
      db,
      await op(),
      schedule,
      "planner@test.com",
      "reviewed",
    );
    await releaseSchedule(
      db,
      "1",
      "planner@test.com",
      "billing",
      "budget@test.com",
    );
    await releaseSchedule(
      db,
      "1",
      "planner@test.com",
      "billing",
      "budget@test.com",
    );
    assert.equal((await query("SELECT * FROM web_tasks")).rows.length, 1);
    assert.equal(
      (
        await query<any>("SELECT assigned_to FROM web_tasks WHERE id=$1", [
          taskId,
        ])
      ).rows[0].assigned_to,
      "budget@test.com",
    );
    assert.equal(
      (await query<any>("SELECT release_kind FROM web_service_schedules"))
        .rows[0].release_kind,
      "billing",
    );
    await prepareCustomerDelivery(db, request, "planner@test.com");
    await prepareCustomerDelivery(db, request, "planner@test.com");
    const reports = (
      await query<any>("SELECT * FROM web_service_customer_reports")
    ).rows;
    assert.equal(reports.length, 1);
    assert.match(reports[0].filename, /Completo.pdf$/);
    assert.ok(reports[0].content.length > 0);
    const messages = await claimServiceMessages();
    assert.equal(messages.length, 1);
    assert.match(messages[0].text, /customer-report\/[a-f0-9]{64}/);
    assert.equal(messages[0].number, request.phone);
    const { GET: customerPdf } =
      await import("../app/api/service-scheduling/customer-report/[token]/route");
    const token = messages[0].text.match(/customer-report\/([a-f0-9]{64})/)![1];
    const requestPdf = new Request(
      "https://rjcompressores.app/api/service-scheduling/customer-report/" +
        token,
    );
    const available = await customerPdf(requestPdf, {
      params: Promise.resolve({ token }),
    });
    assert.equal(available.status, 200);
    assert.equal(available.headers.get("Content-Type"), "application/pdf");
    assert.equal(
      (
        await customerPdf(requestPdf, {
          params: Promise.resolve({ token: "0".repeat(64) }),
        })
      ).status,
      404,
    );
    await query(
      "UPDATE web_service_customer_reports SET expires_at=now()-interval '1 day'",
    );
    assert.equal(
      (await customerPdf(requestPdf, { params: Promise.resolve({ token }) }))
        .status,
      404,
    );

    assert.equal((await claimServiceMessages()).length, 0);
    await acknowledgeServiceMessage(messages[0].id.slice(8), messages[0].token);
    await acknowledgeServiceMessage(messages[0].id.slice(8), messages[0].token);
    const creator = { id: "planner", email: "planner@test.com" },
      approver = { id: "tech", email: "tech@test.com" };
    const approval = await createTask(
      {
        title: "Aprovar peça",
        description: "Comprar filtro",
        taskType: "approval",
        assignedTo: approver.email,
        priority: "normal",
        dueDate: "",
        orderCompany: "1",
        orderId: "100",
      },
      creator,
    );
    const rejected = await updateTask(
      {
        action: "approval_decide",
        id: String(approval.task.id),
        version: 1,
        decision: "rejected",
        reason: "Corrigir a referência do filtro.",
      },
      approver,
    );
    await assert.rejects(
      updateTask(
        {
          action: "approval_retry",
          id: String(approval.task.id),
          version: rejected.task.version,
          description: "Ref. corrigida 123",
        },
        approver,
      ),
    );
    const corrected = await updateTask(
      {
        action: "approval_retry",
        id: String(approval.task.id),
        version: rejected.task.version,
        description: "Ref. corrigida 123",
      },
      creator,
    );
    assert.equal(corrected.task.approval_state, "rejected");
    assert.equal(
      corrected.task.approval_reason,
      "Corrigir a referência do filtro.",
    );
    assert.ok(corrected.approvalCorrection);
    const child = (
      await query<any>("SELECT * FROM web_tasks WHERE approval_parent_id=$1", [
        approval.task.id,
      ])
    ).rows[0];
    assert.equal(child.approval_state, "pending");
    assert.match(child.approval_description, /Ref. corrigida 123/);
    await updateTask(
      {
        action: "approval_retry",
        id: String(approval.task.id),
        version: corrected.task.version,
        description: "Ref. corrigida 123",
      },
      creator,
    );
    assert.equal(
      (
        await query("SELECT * FROM web_tasks WHERE approval_parent_id=$1", [
          approval.task.id,
        ])
      ).rows.length,
      1,
    );
    assert.equal(await billingMaterialOwner(db, "1", "100"), "budget@test.com");
    const addition = randomUUID(),
      info = {
        orderNumber: "15128",
        productCode: "123",
        productName: "Filtro",
        quantity: 1,
        unit: "UN",
        price: 100,
        justification: "Falha identificada",
      };
    const budget = await createBillingMaterialTask(
      db,
      addition,
      { company: "1", order: "100" },
      creator.email,
      info,
      "budget@test.com",
    );
    assert.equal(
      await createBillingMaterialTask(
        db,
        addition,
        { company: "1", order: "100" },
        creator.email,
        info,
        "budget@test.com",
      ),
      budget,
    );
    const legacyId = randomUUID();
    await query(
      "INSERT INTO web_service_operations(id,schedule_id,position,document,status,updated_by) VALUES($1,1,2,$2,'awaiting_review','tech@test.com')",
      [
        legacyId,
        JSON.stringify({
          responsible: "tech@test.com",
          description: "Operação anterior",
        }),
      ],
    );
    await query(
      "INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,'dispatch','planner@test.com','Enviada pelo planejador')",
      [legacyId],
    );
    const legacy = (
      await query<any>("SELECT * FROM web_service_operations WHERE id=$1", [
        legacyId,
      ])
    ).rows[0];
    const legacyTask = await handoffOperation(
      db,
      legacy,
      { ...schedule, created_by: "Sistema · Entrada automática" },
      "tech@test.com",
      "review",
    );
    assert.equal(
      (
        await query<any>("SELECT assigned_to FROM web_tasks WHERE id=$1", [
          legacyTask,
        ])
      ).rows[0].assigned_to,
      "planner@test.com",
    );
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
