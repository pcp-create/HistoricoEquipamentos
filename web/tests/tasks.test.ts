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
      "011_task_kanban.sql",
      "012_manual_tasks.sql",
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
      () =>
        updateTask(
          {
            id,
            version: t.version,
            action: "update",
            assignedTo: "missing@example.com",
            priority: "high",
            automaticPriority: false,
          },
          user,
        ),
      /ativo/,
    );
    let d = await updateTask(
      {
        id,
        version: t.version,
        action: "update",
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
    const notices = await claimNotifications("https://app.example");
    assert.equal(notices.length, 1);
    assert.match(notices[0].text, /TAR-/);
    assert.equal(notices[0].number, "5547999999999");
    assert.equal((await claimNotifications("https://app.example")).length, 0);
    await assert.rejects(() =>
      acknowledgeNotification(
        notices[0].id,
        "00000000-0000-0000-0000-000000000000",
      ),
    );
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
        action: "update",
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
    assert.equal(reassigned[0].number, "5547888888888");
    await acknowledgeNotification(reassigned[0].id, reassigned[0].token);
    d = await updateTask(
      {
        id,
        version: d.task.version,
        action: "update",
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
        action: "update",
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
      "foto.png",
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
        /Envie PDF/,
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
    assert.ok(
      d.notes.some((n: any) => n.title === "Tarefa concluída automaticamente"),
    );
    await assert.rejects(
      () =>
        updateTask(
          {
            id,
            version: d.task.version,
            action: "update",
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
        action: "update",
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
          action: "move",
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
        action: "move",
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
        action: "move",
        column: "overdue",
      },
      user,
    );
    assert.equal(movable.task.kanban_column, "overdue");
    movable = await updateTask(
      {
        id: String(current.id),
        version: movable.task.version,
        action: "move",
        column: "completed",
      },
      user,
    );
    assert.equal(movable.task.status, "completed");
    assert.equal((await syncTasks(async () => [source])).created, 0);
    await assert.rejects(
      () =>
        updateTask(
          {
            id: String(current.id),
            version: movable.task.version,
            action: "move",
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
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
