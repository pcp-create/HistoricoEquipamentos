import {listWorkshopEvents} from "../lib/workshop/task-history";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  createTask,
  syncTasks,
  updateTask,
  taskDetail,
  listTasks,
  attachTask,
} from "../lib/tasks/store";
import {
  claimNotifications,
  acknowledgeNotification,
} from "../lib/tasks/notifications";
import type { TaskSource } from "../lib/tasks/sources";
const source: TaskSource = {
  key: "rental:1:1:22",
  cycle: "contract",
  equipment: "1",
  plan: null,
  origin: "Máquina de Locação",
  title: "Acompanhar locação",
  name: "Compressor",
  customer: "Cliente",
  state: "soon",
  alert: true,
  resolved: false,
  priority: "normal",
  due: "2026-10-10",
};
test("task lifecycle: deduplication, assignment notification, manual priority, notes, attachments, resolution and new immutable occurrence", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const f of [
      "008_administration.sql",
      "009_employees.sql",
      "010_tasks.sql",
      "018_task_assignment_reason.sql",
      "011_task_kanban.sql",
      "012_manual_tasks.sql",
      "016_task_order_links.sql",
      "015_task_origin_rules.sql",
      "013_task_territories.sql",
      "041_task_completion_notifications.sql",
      "042_restricted_tasks.sql",
      "024_task_stages.sql",
      "027_task_stage_assignment.sql",
      "017_task_reminders.sql",
      "023_task_reminder_recurrence.sql",
      "044_task_followers.sql",
      "073_task_approvals.sql",
    ])
      await db.exec(
        readFileSync(new URL("../sql/" + f, import.meta.url), "utf8"),
      );
    const q = db.query.bind(db);
    g.historyPool = {
      query: q,
      connect: async () => ({ query: q, release() {} }),
    };
    await db.query(
      "INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('person@example.com','Pessoa','5547999999999','teste'),('other@example.com','Outro','5547888888888','teste')",
    );
    const user = {
      id: "u",
      email: "person@example.com",
      user_metadata: { full_name: "Pessoa" },
    };
    const manual = await createTask(
      {
        title: "Contato manual",
        description: "Retornar ao cliente",
        priority: "high",
        assignedTo: user.email,
        dueDate: "2026-10-10",
      },
      user,
    );
    assert.equal(manual.task.creator_name, "Pessoa");
    assert.equal(manual.notifications.length, 1);
    await syncTasks(async () => []);
    assert.equal(
      (await taskDetail(String(manual.task.id))).task.status,
      "not_started",
    );
    assert.deepEqual(manual.task.followers, [user.email]);
    const done = await updateTask(
      {
        action: "move", assignmentReason: "Redistribuição da equipe",
        id: String(manual.task.id),
        version: manual.task.version,
        column: "completed",
      },
      user,
    );
    const completedManual = await claimNotifications("https://app.example");
    assert.equal(completedManual.length,1);
    assert.match(completedManual[0].text,/Tarefa concluída/);
    await acknowledgeNotification(completedManual[0].id,completedManual[0].token);
    assert.equal((await claimNotifications("https://app.example")).length,0);
    const reopened = await updateTask(
      {
        action: "reopen",
        id: String(manual.task.id),
        version: done.task.version,
      },
      user,
    );
    assert.equal(reopened.task.status, "not_started");
    assert.equal(reopened.task.completed_at, null);
    assert.equal(reopened.task.assigned_to, user.email);
    assert.ok(reopened.notes.some((n: any) => n.title === "Tarefa reaberta"));
    await assert.rejects(
      () =>
        updateTask(
          {
            action: "reopen",
            id: String(manual.task.id),
            version: done.task.version,
          },
          user,
        ),
      /atualizada/,
    );
    await syncTasks(async () => []);
    assert.equal(
      (await taskDetail(String(manual.task.id))).task.status,
      "not_started",
    );
    await db.query("DELETE FROM web_task_notifications WHERE task_id=$1", [
      manual.task.id,
    ]);
    await db.query("DELETE FROM web_task_notes WHERE task_id=$1", [
      manual.task.id,
    ]);
    await db.query("DELETE FROM web_tasks WHERE id=$1", [manual.task.id]);
    assert.equal((await syncTasks(async () => [source])).created, 1);
    assert.equal((await syncTasks(async () => [source])).created, 0);
    let t = (await listTasks(new URLSearchParams(), user)).tasks[0];
    const id = String(t.id);
    assert.equal(t.status, "not_started");
    assert.equal(t.assigned_to, null);
    await assert.rejects(
      () => updateTask({ action: "reopen", id, version: t.version }, user),
      /Somente tarefas manuais/,
    );

    await assert.rejects(
      () =>
        updateTask(
          {
            id,
            version: t.version,
            action: "update", assignmentReason: "Redistribuição da equipe",
            assignedTo: "missing@example.com",
            priority: "high",
            automaticPriority: false,
          },
          user,
        ),
      /ativo/,
    );
    await assert.rejects(() => updateTask({ id, version: t.version, action: "update", assignedTo: user.email, priority: "high", automaticPriority: false }, user), /justificativa/);
    let d = await updateTask(
      {
        id,
        version: t.version,
        action: "update", assignmentReason: "Redistribuição da equipe",
        assignedTo: user.email,
        priority: "high",
        automaticPriority: false,
      },
      user,
    );
    assert.equal(d.task.status, "in_progress");
    assert.ok(d.task.first_assigned_at);
    assert.equal(
      (
        await listTasks(new URLSearchParams("mine=true"), {
          ...user,
          email: "other@example.com",
        })
      ).tasks.length,
      0,
    );
    assert.equal(
      (await listTasks(new URLSearchParams("mine=true"), user)).tasks.length,
      1,
    );
    await db.query("INSERT INTO web_task_stages(id,job_title,name,sort_order,updated_by) VALUES('11111111-1111-4111-8111-111111111111','Planejamento','Contato com cliente',1,'teste')");
    await db.query("UPDATE web_tasks SET stage_id='11111111-1111-4111-8111-111111111111' WHERE id=$1",[id]);
    const notices = await claimNotifications("https://app.example");
    assert.equal(notices.length, 1);
    assert.match(notices[0].text, /TAR-/);
    assert.match(notices[0].text, /Etapa: Contato com cliente/);
    assert.match(notices[0].text, /Equipamento: Compressor\nCliente: Cliente/);
    assert.equal(notices[0].number, "5547999999999");
    assert.equal((await claimNotifications("https://app.example")).length, 0);
    await assert.rejects(() =>
      acknowledgeNotification(
        notices[0].id,
        "00000000-0000-0000-0000-000000000000",
      ),
    );
    await db.query("UPDATE web_task_notifications SET leased_until=now()-interval '1 minute' WHERE id=$1",[notices[0].id]);
    assert.equal((await claimNotifications("https://app.example")).length,0);
    await acknowledgeNotification(notices[0].id, notices[0].token);
    await acknowledgeNotification(notices[0].id, notices[0].token);
    assert.equal((await claimNotifications("https://app.example")).length, 0);
    d = await taskDetail(id);
    const legacy = await db.query<{ id: string }>(
      "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,'Responsável / prioridade atualizados','Atribuído a: person@example.com. Prioridade: Urgente.',false,'person@example.com','person@example.com') RETURNING id",
      [id],
    );
    const legacyNote = (await taskDetail(id)).notes.find(
      (n: any) => String(n.id) === String(legacy.rows[0].id),
    );
    assert.equal(
      legacyNote.description,
      "Atribuído a: Pessoa. Prioridade: Urgente.",
    );
    assert.equal(legacyNote.created_name, "Pessoa");
    const storedNote = await db.query<{ description: string }>(
      "SELECT description FROM web_task_notes WHERE id=$1",
      [legacy.rows[0].id],
    );
    assert.match(storedNote.rows[0].description, /person@example.com/);
    d = await updateTask(
      {
        id,
        version: d.task.version,
        action: "update", assignmentReason: "Redistribuição da equipe",
        assignedTo: "other@example.com",
        priority: "high",
        automaticPriority: false,
      },
      user,
    );
    assert.equal(d.task.assignee_name, "Outro");
    assert.equal(d.task.modifier_name, "Pessoa");
    assert.match(d.notes[0].description, /Atribuído a: Outro/);
    const reassigned = await claimNotifications("https://app.example");
    assert.equal(reassigned.length, 1);
    assert.match(reassigned[0].text, /Etapa: Contato com cliente/);
    assert.match(reassigned[0].text, /Justificativa: Redistribuição da equipe/);
    assert.match(d.notes[0].description, /Justificativa: Redistribuição da equipe/);
    assert.equal(reassigned[0].number, "5547888888888");
    await acknowledgeNotification(reassigned[0].id, reassigned[0].token);
    d = await updateTask(
      {
        id,
        version: d.task.version,
        action: "update", assignmentReason: "Redistribuição da equipe",
        assignedTo: "other@example.com",
        priority: "normal",
        automaticPriority: false,
      },
      user,
    );
    assert.equal((await claimNotifications("https://app.example")).length, 0);
    d = await updateTask(
      {
        id,
        version: d.task.version,
        action: "update", assignmentReason: "Redistribuição da equipe",
        assignedTo: "other@example.com",
        priority: "high",
        automaticPriority: false,
      },
      user,
    );
    await syncTasks(async () => [
      { ...source, state: "overdue", priority: "urgent" },
    ]);
    d = await taskDetail(id);
    assert.equal(d.task.priority, "high");
    await assert.rejects(
      () =>
        updateTask(
          {
            id,
            version: t.version,
            action: "note",
            title: "Nota",
            description: "texto",
          },
          user,
        ),
      /atualizada/,
    );
    d = await updateTask(
      {
        id,
        version: d.task.version,
        action: "note",
        title: "Cliente contatado",
        description: "Aguardando retorno",
      },
      user,
    );
    assert.equal(d.notes[0].created_by, user.email);
    d = await attachTask(
      id,
      new File(["%PDF-1.7 evidência"], "evidencia.PDF"),
      user,
    );
    assert.equal(d.attachments.length, 1);
    for (const name of [
      "programa.exe",
      "foto.svg",
      "arquivo.pdf.exe",
      "semextensao",
      "documento.docm",
    ]) {
      await assert.rejects(
        () =>
          attachTask(
            id,
            new File(["conteúdo"], name, { type: "application/pdf" }),
            user,
          ),
        /Envie fotos/,
      );
    }

    await assert.rejects(
      () =>
        attachTask(id, new File([new Uint8Array(3000001)], "grande.bin"), user),
      /3 MB/,
    );
    await syncTasks(async () => [
      { ...source, state: "incomplete", alert: false, resolved: false },
    ]);
    assert.notEqual((await taskDetail(id)).task.status, "completed");
    await assert.rejects(() =>
      syncTasks(async () => {
        throw Error("Falha origem");
      }),
    );
    assert.notEqual((await taskDetail(id)).task.status, "completed");
    await syncTasks(async () => [
      { ...source, state: "current", alert: false, resolved: true },
    ]);
    d = await taskDetail(id);
    assert.equal(d.task.status, "completed");
    assert.ok(d.task.completed_at);
    const completedAuto = await claimNotifications("https://app.example");
    assert.equal(completedAuto.length,1);
    assert.match(completedAuto[0].text,/Tarefa concluída/);
    await acknowledgeNotification(completedAuto[0].id,completedAuto[0].token);
    await syncTasks(async () => [{ ...source, state:"current", alert:false, resolved:true }]);
    assert.equal((await claimNotifications("https://app.example")).length,0);
    assert.ok(
      d.notes.some((n: any) => n.title === "Tarefa concluída automaticamente"),
    );
    await assert.rejects(
      () =>
        updateTask(
          {
            id,
            version: d.task.version,
            action: "update", assignmentReason: "Redistribuição da equipe",
            assignedTo: user.email,
            priority: "high",
            automaticPriority: false,
          },
          user,
        ),
      /não são reabertas/,
    );
    assert.equal((await syncTasks(async () => [source])).created, 1);
    const all = (await listTasks(new URLSearchParams(), user)).tasks;
    assert.equal(all.length, 2);
    assert.notEqual(String(all[0].id), id);
    assert.equal((await taskDetail(id)).attachments.length, 1);
    const current = all[0];
    await updateTask(
      {
        id: String(current.id),
        version: current.version,
        action: "update", assignmentReason: "Redistribuição da equipe",
        assignedTo: "other@example.com",
        priority: "normal",
        automaticPriority: true,
      },
      user,
    );
    await db.query(
      "UPDATE web_user_access SET enabled=false WHERE email='other@example.com'",
    );
    assert.equal((await claimNotifications("https://app.example")).length, 0);
    let movable = await taskDetail(String(current.id));
    const move = (assignment?: string) =>
      updateTask(
        {
          id: String(current.id),
          version: movable.task.version,
          action: "move", assignmentReason: "Redistribuição da equipe",
          column: "in_progress",
          assignment,
        },
        user,
      );
    await assert.rejects(() => move(), /Escolha manter/);
    movable = await move("keep");
    assert.equal(movable.task.assigned_to, "other@example.com");
    movable = await move("self");
    assert.equal(movable.task.assigned_to, user.email);
    assert.equal(movable.notifications[0].recipient, user.email);
    const noticeCount = movable.notifications.length;
    movable = await move("self");
    assert.equal(movable.notifications.length, noticeCount);
    await db.query(
      "UPDATE web_tasks SET assigned_to=NULL,status='not_started',kanban_column='pending' WHERE id=$1",
      [current.id],
    );
    movable = await move();
    assert.equal(movable.task.assigned_to, user.email);
    assert.equal(movable.task.status, "in_progress");
    assert.ok(movable.task.first_assigned_at);
    assert.equal(movable.notifications.length, noticeCount + 1);

    movable = await updateTask(
      {
        id: String(current.id),
        version: movable.task.version,
        action: "move", assignmentReason: "Redistribuição da equipe",
        column: "pending",
      },
      user,
    );
    assert.equal(movable.task.status, "not_started");
    assert.equal(movable.task.kanban_column, "pending");
    movable = await updateTask(
      {
        id: String(current.id),
        version: movable.task.version,
        action: "move", assignmentReason: "Redistribuição da equipe",
        column: "overdue",
      },
      user,
    );
    assert.equal(movable.task.kanban_column, "overdue");
    await assert.rejects(
      () =>
        updateTask(
          {
            id: String(current.id),
            version: movable.task.version,
            action: "move", assignmentReason: "Redistribuição da equipe",
            column: "completed",
          },
          user,
        ),
      /automaticamente/,
    );
    assert.notEqual(
      (await taskDetail(String(current.id))).task.status,
      "completed",
    );
    await syncTasks(async () => [
      { ...source, state: "current", alert: false, resolved: true },
    ]);
    movable = await taskDetail(String(current.id));
    assert.equal(movable.task.status, "completed");
    await assert.rejects(
      () =>
        updateTask(
          {
            id: String(current.id),
            version: movable.task.version,
            action: "move", assignmentReason: "Redistribuição da equipe",
            column: "pending",
          },
          user,
        ),
      /reabertas/,
    );
    await syncTasks(async () => [
      { ...source, state: "current", alert: false, resolved: true },
    ]);
    assert.equal((await syncTasks(async () => [source])).created, 1);
    await syncTasks(async () => []);
    assert.equal(
      (await listTasks(new URLSearchParams(), user)).tasks.filter(
        (t) => t.status !== "completed",
      ).length,
      0,
    );
    const restricted = await createTask({title:"Conteúdo confidencial",description:"Nota sigilosa",priority:"normal",assignedTo:user.email,dueDate:"",restricted:true},user);
    const restrictedId = String(restricted.task.id);
    assert.equal(restricted.task.title,"Tarefa restrita");
    assert.equal(restricted.task.redacted,true);
    const publicTask = (await listTasks(new URLSearchParams(),user)).tasks.find(t=>String(t.id)===restrictedId);
    assert.equal(publicTask.title,"Tarefa restrita");
    assert.equal(JSON.stringify(publicTask).includes("confidencial"),false);
    assert.equal(publicTask.created_by,undefined);
    assert.equal(publicTask.assignee_name,"Pessoa");
    assert.equal(publicTask.assigned_to,null);
    assert.equal(publicTask.description,undefined);
    await assert.rejects(()=>taskDetail(restrictedId,user));
    await assert.rejects(()=>updateTask({id:restrictedId,version:1,action:"note",title:"Nota",description:"Teste"},user));
    await assert.rejects(()=>attachTask(restrictedId,new File(["secret"],"nota.pdf",{type:"application/pdf"}),user));
    assert.equal((await claimNotifications("https://example.com")).some(n=>n.text.includes("Conteúdo confidencial")),false);
    assert.equal((await db.query<{state:string}>("SELECT state FROM web_task_notifications WHERE task_id=$1",[restrictedId])).rows[0].state,"skipped");
    await db.query("UPDATE web_user_access SET role='admin' WHERE email=$1",[user.email]);
    const privateDetail = await taskDetail(restrictedId,user);
    assert.equal(privateDetail.task.title,"Conteúdo confidencial");
    assert.ok(privateDetail.notes.some(n=>n.description.includes("Nota sigilosa")));
    assert.equal((await listTasks(new URLSearchParams(),user)).tasks.find(t=>String(t.id)===restrictedId).title,"Conteúdo confidencial");
    const madePublic = await updateTask({id:restrictedId,version:privateDetail.task.version,action:"update",priority:"normal",assignedTo:user.email,automaticPriority:false,restricted:false},user);
    assert.equal(madePublic.task.restricted,false);
    await db.query("UPDATE web_user_access SET role='user' WHERE email=$1",[user.email]);
    const hidden = await updateTask({id:restrictedId,version:madePublic.task.version,action:"update",priority:"normal",assignedTo:user.email,automaticPriority:false,restricted:true},user);
    assert.equal(hidden.task.redacted,true);
    assert.equal(hidden.task.title,"Tarefa restrita");
    await assert.rejects(()=>taskDetail(restrictedId,user));
    await db.query("INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('third@example.com','Terceiro','5547777777777','teste')");
    await db.query("UPDATE web_user_access SET enabled=true WHERE email='other@example.com'");
    let followed = await createTask({title:"Acompanhada",description:"",priority:"normal",assignedTo:user.email,dueDate:""},user);
    for(const n of await claimNotifications("https://example.com")) await acknowledgeNotification(n.id,n.token);
    followed = await updateTask({action:"followers",id:String(followed.task.id),version:followed.task.version,followers:[user.email,'other@example.com','third@example.com',user.email]},user);
    assert.equal(followed.task.followers.length,3);
    assert.equal((await claimNotifications("https://example.com")).length,0);
    followed = await updateTask({action:"update",id:String(followed.task.id),version:followed.task.version,assignedTo:'other@example.com',priority:'normal',automaticPriority:false,assignmentReason:'Redistribuição'},user);
    const fanout = await claimNotifications("https://example.com");
    assert.equal(fanout.length,3);
    assert.equal(new Set(fanout.map(n=>n.number)).size,3);
    assert.ok(fanout.some(n=>n.text.includes('Responsável da tarefa atualizado')));
    for(const n of fanout) await acknowledgeNotification(n.id,n.token);
    await assert.rejects(()=>updateTask({action:"followers",id:String(followed.task.id),version:followed.task.version,followers:['missing@example.com']},user),/ativos/);
    followed = await updateTask({action:"followers",id:String(followed.task.id),version:followed.task.version,followers:['third@example.com']},user);

    followed = await updateTask({action:"move",id:String(followed.task.id),version:followed.task.version,column:'completed'},user);
    const completions = await claimNotifications("https://example.com");
    assert.equal(completions.length,2);
    assert.ok(!completions.some(n=>n.number==='5547999999999'));
    assert.ok(completions.every(n=>n.text.includes('Tarefa concluída')));
    await db.query("UPDATE web_user_access SET role='admin' WHERE email=$1",[user.email]);
    const secret = await taskDetail(restrictedId,user);
    await assert.rejects(()=>updateTask({action:"followers",id:restrictedId,version:secret.task.version,followers:['third@example.com']},user),/administradores/);


    const approver={...user,email:'other@example.com'};
    let approval=await createTask({taskType:'approval',title:'Autorizar compra',description:'Aprovar aquisição do motor.',assignedTo:approver.email,priority:'normal',dueDate:''},user);
    const aid=String(approval.task.id);
    assert.equal(approval.task.approval_state,'pending');
    assert.equal(approval.canDecideApproval,false);
    assert.equal((await taskDetail(aid,approver)).canDecideApproval,true);
    await assert.rejects(()=>updateTask({action:'approval_decide',id:aid,version:1,decision:'approved'},user));
    await assert.rejects(()=>updateTask({action:'move',id:aid,version:1,column:'completed'},approver),/fluxo de aprovação/);
    await assert.rejects(()=>updateTask({action:'approval_decide',id:aid,version:1,decision:'rejected',reason:' '},approver),/justificativa/);
    approval=await updateTask({action:'approval_decide',id:aid,version:1,decision:'rejected',reason:'Revisar o valor antes de comprar.'},approver);
    assert.equal(approval.task.assigned_to,user.email);
    assert.equal(approval.task.approval_state,'rejected');
    assert.equal(approval.task.approval_reason,'Revisar o valor antes de comprar.');
    assert.equal(approval.notifications[0].recipient,user.email);
    await assert.rejects(()=>updateTask({action:'approval_decide',id:aid,version:2,decision:'approved'},approver),/já foi decidida/);
    await assert.rejects(()=>updateTask({action:'approval_close',id:aid,version:2},approver));
    approval=await updateTask({action:'approval_close',id:aid,version:2},user);
    assert.equal(approval.task.status,'completed');
    let approved=await createTask({taskType:'approval',title:'Autorizar serviço',description:'Autorizar revisão.',assignedTo:approver.email,priority:'normal',dueDate:''},user);
    await assert.rejects(()=>updateTask({action:'approval_decide',id:String(approved.task.id),version:1,decision:'approved',reason:' '},approver),/justificativa da aprovação/);
    approved=await updateTask({action:'approval_decide',id:String(approved.task.id),version:1,decision:'approved',reason:'De acordo com a proposta apresentada.'},approver);
    assert.equal(approved.task.approval_state,'approved');assert.equal(approved.task.assigned_to,user.email);assert.match(approved.task.approval_reason,/De acordo/);
    const approvalNotices=await claimNotifications('https://example.com');assert.ok(approvalNotices.some(n=>n.text.includes('Solicitação aprovada — de acordo')));

    await db.exec(`CREATE TABLE m8_equipment_catalog(equipment_id bigint,name text,model text,serial text);
      CREATE TABLE m8_person_equipment(equipment_id bigint,person_name text,present boolean);
      CREATE TABLE web_workshop_events(id bigint GENERATED ALWAYS AS IDENTITY,visit_id uuid,action text,actor text,document jsonb,created_at timestamptz DEFAULT now());
      CREATE TABLE web_workshops(id bigint,name text);
      CREATE TABLE web_workshop_visits(id uuid,equipment_id bigint,workshop_id bigint,source jsonb,exited_at timestamptz,reconciled_out_at timestamptz);
      INSERT INTO m8_equipment_catalog VALUES(77,'Compressor oficina','GA22','SER123');
      INSERT INTO m8_person_equipment VALUES(77,'Cliente cadastro',true);
      INSERT INTO web_workshops VALUES(1,'Oficina RJ');
      INSERT INTO web_workshop_visits VALUES('12345678-1234-4234-8234-123456789abc',77,1,'{"customer":"Cliente oficina"}',NULL,NULL),('22345678-1234-4234-8234-123456789abc',NULL,1,'{"customer":"Cliente sem código","equipment_description":"Motor importado"}',NULL,NULL);`);
    for(const taskType of ['standard','approval']){
      const created=await createTask({taskType,workshopVisitId:'12345678-1234-4234-8234-123456789abc',title:'Revisar compressor',description:'Analisar o motor',priority:'normal',assignedTo:approver.email,dueDate:'',customer:'Cliente adulterado'},user);
      assert.match(created.task.source_key,/^manual:workshop:12345678-1234-4234-8234-123456789abc:/);
      assert.equal(String(created.task.equipment_id),'77');
      assert.equal(created.task.equipment_name,'Compressor oficina');assert.equal(created.task.customer,'Cliente oficina');
      assert.equal(created.task.task_type,taskType);assert.equal(created.task.assigned_to,approver.email);
      assert.equal(created.task.origin,taskType==='approval'?'Aprovação':'Oficina');
      assert.ok(created.notes.some(n=>n.description.includes('Oficina RJ')));
      if(taskType==='approval')assert.equal(created.task.approval_state,'pending');
      const creationEvent=(await db.query<any>("SELECT * FROM web_workshop_events WHERE document->>'taskId'=$1",[String(created.task.id)])).rows[0];
      assert.equal(creationEvent.visit_id,'12345678-1234-4234-8234-123456789abc');assert.equal(creationEvent.actor,user.email);
      if(taskType==='approval'){
        await assert.rejects(()=>updateTask({action:'approval_decide',id:String(created.task.id),version:1,decision:'approved',reason:''},approver),/justificativa/);
        const decision=await updateTask({action:'approval_decide',id:String(created.task.id),version:1,decision:'approved',reason:'Compra necessária para liberar a máquina.'},approver);
        const event=(await db.query<any>("SELECT * FROM web_workshop_events WHERE document->>'taskId'=$1 ORDER BY id DESC LIMIT 1",[String(created.task.id)])).rows[0];
        assert.match(event.action,/Solicitação aprovada/);assert.match(event.document.notes,/Compra necessária/);assert.equal(event.actor,approver.email);assert.equal(event.document.approvalState,'approved');
        await updateTask({action:'approval_close',id:String(created.task.id),version:decision.task.version},user);
        assert.equal((await db.query<any>("SELECT count(*) n FROM web_workshop_events WHERE document->>'taskId'=$1",[String(created.task.id)])).rows[0].n,3);
      }else{
        await updateTask({action:'move',id:String(created.task.id),version:1,column:'completed',assignmentReason:'Serviço concluído'},user);
        const event=(await db.query<any>("SELECT document FROM web_workshop_events WHERE document->>'taskId'=$1 ORDER BY id DESC LIMIT 1",[String(created.task.id)])).rows[0];
        assert.equal(event.document.status,'completed');
        assert.ok((await listWorkshopEvents({query:q},['12345678-1234-4234-8234-123456789abc'],false)).some(e=>e.document.taskId===String(created.task.id)));
        await db.query('UPDATE web_tasks SET restricted=true WHERE id=$1',[created.task.id]);
        assert.ok(!(await listWorkshopEvents({query:q},['12345678-1234-4234-8234-123456789abc'],false)).some(e=>e.document.taskId===String(created.task.id)));
        assert.ok((await listWorkshopEvents({query:q},['12345678-1234-4234-8234-123456789abc'],true)).some(e=>e.document.taskId===String(created.task.id)));

      }

      const orphan=await createTask({taskType,workshopVisitId:'22345678-1234-4234-8234-123456789abc',title:'Conferir motor',description:'Analisar retorno',priority:'normal',assignedTo:approver.email,dueDate:''},user);
      assert.equal(orphan.task.equipment_id,null);assert.equal(orphan.task.customer,'Cliente sem código');assert.equal(orphan.task.equipment_name,'Motor importado');
      if(taskType==='approval'){
        const rejected=await updateTask({action:'approval_decide',id:String(orphan.task.id),version:1,decision:'rejected',reason:'Revisar o valor e enviar nova proposta.'},approver);
        const event=(await db.query<any>("SELECT * FROM web_workshop_events WHERE document->>'taskId'=$1 ORDER BY id DESC LIMIT 1",[String(orphan.task.id)])).rows[0];
        assert.equal(event.visit_id,'22345678-1234-4234-8234-123456789abc');assert.equal(event.document.approvalState,'rejected');assert.match(event.document.notes,/Revisar o valor/);assert.equal(rejected.task.assigned_to,user.email);
        await assert.rejects(()=>updateTask({action:'approval_decide',id:String(orphan.task.id),version:rejected.task.version,decision:'rejected',reason:'Repetido'},approver),/já foi decidida/);
        assert.equal((await db.query<any>("SELECT count(*) n FROM web_workshop_events WHERE document->>'taskId'=$1",[String(orphan.task.id)])).rows[0].n,2);
      }

    }
    const workshopBody={taskType:'standard',workshopVisitId:'12345678-1234-4234-8234-123456789abc',title:'Conferir',description:'Conferir',priority:'normal',assignedTo:'',dueDate:''};
    await assert.rejects(()=>createTask({...workshopBody,equipmentId:'999'},user),/Vínculo de oficina inválido/);
    await assert.rejects(()=>createTask({...workshopBody,workshopVisitId:'33345678-1234-4234-8234-123456789abc'},user),/não encontrada/);
    await db.query('UPDATE web_workshop_visits SET exited_at=now()');
    await assert.rejects(()=>createTask(workshopBody,user),/já foi encerrada/);

  } finally {
    g.historyPool = old;
    await db.close();
  }
});
