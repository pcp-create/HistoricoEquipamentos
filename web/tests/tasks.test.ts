import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
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
    d = await attachTask(id, new File(["evidência"], "evidencia.txt"), user);
    assert.equal(d.attachments.length, 1);
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
