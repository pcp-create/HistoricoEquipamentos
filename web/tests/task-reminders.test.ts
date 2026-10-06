import { claimNotifications, acknowledgeNotification } from "../lib/tasks/notifications";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  saveReminder,
  listReminders,
  claimReminders,
  acknowledgeReminder,
  reminderInstant,
} from "../lib/tasks/reminders";
test("scheduled reminders validate time, lease once, acknowledge and cancel without affecting assignments", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool,
    query = db.query.bind(db);
  g.historyPool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const f of [
      "008_administration",
      "009_employees",
      "010_tasks",
      "011_task_kanban",
      "012_manual_tasks",
      "017_task_reminders",
      "023_task_reminder_recurrence",
      "018_task_assignment_reason",
      "041_task_completion_notifications",
      "024_task_stages",
      "027_task_stage_assignment",
      "044_task_followers",
    ])
      await db.exec(
        readFileSync(new URL("../sql/" + f + ".sql", import.meta.url), "utf8"),
      );
    await db.exec(
      `INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('a@example.com','Pessoa','5547999999999','test');INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,source_status,priority,assigned_to) VALUES('manual:x','manual','Tarefa manual','Teste','','manual','normal','a@example.com');`,
    );
    assert.throws(() => reminderInstant("2020-01-01T10:00"), /futuras/);
    assert.throws(() => reminderInstant("2099-02-30T10:00"), /futuras/);
    assert.equal(
      reminderInstant("2099-01-01T07:30"),
      "2099-01-01T10:30:00.000Z",
    );
    await saveReminder(
      { action: "create", taskId: "1", when: "2099-01-01T07:30" },
      "a@example.com",
    );
    await assert.rejects(
      () =>
        saveReminder(
          { action: "create", taskId: "1", when: "2099-01-01T07:30" },
          "a@example.com",
        ),
      /Já existe/,
    );
    assert.equal((await claimReminders("https://app.example")).length, 0);
    await db.exec(
      "UPDATE web_task_reminders SET scheduled_at=now()-interval '1 minute'",
    );
    await db.exec("INSERT INTO web_user_access(email,display_name,phone,updated_by) VALUES('b@example.com','Acompanhante','5547888888888','test'); UPDATE web_tasks SET followers=ARRAY['a@example.com','b@example.com']");
    const claimed = await claimReminders("https://app.example");
    assert.equal(claimed.length, 1);
    const followers = await claimNotifications("https://app.example",true);
    assert.equal(followers.length,1);
    assert.equal(followers[0].number,"5547888888888");
    assert.match(followers[0].text,/Lembrete de tarefa/);
    await acknowledgeNotification(followers[0].id,followers[0].token);
    assert.equal((await claimNotifications("https://app.example",true)).length,0);
    assert.match(claimed[0].text, /Lembrete de tarefa/);
    assert.equal((await claimReminders("https://app.example")).length, 0);
    await assert.rejects(
      () =>
        saveReminder(
          { action: "cancel", taskId: "1", id: "1" },
          "a@example.com",
        ),
      /em envio/,
    );
    await db.query("UPDATE web_task_reminders SET leased_until=now()-interval '1 minute' WHERE id=1");
    assert.equal((await claimReminders("https://app.example")).length,0);
    await acknowledgeReminder("1", claimed[0].token);
    await acknowledgeReminder("1", claimed[0].token);
    assert.equal((await listReminders("1"))[0].state, "sent");
    await saveReminder(
      { action: "create", taskId: "1", when: "2099-01-02T07:30" },
      "a@example.com",
    );
    const pending = (await listReminders("1")).find(
      (r) => r.state === "pending",
    );
    await saveReminder(
      { action: "cancel", taskId: "1", id: pending.id },
      "a@example.com",
    );
    assert.equal(
      (await listReminders("1")).find((r) => r.id === pending.id).state,
      "cancelled",
    );
    await saveReminder(
      { action: "create", taskId: "1", when: "2099-01-03T07:30" },
      "a@example.com",
    );
    await db.exec(
      "UPDATE web_tasks SET status='completed';UPDATE web_task_reminders SET scheduled_at=now()-interval '2 minutes' WHERE state='pending'",
    );
    assert.equal((await claimReminders("https://app.example")).length, 0);
    assert.equal(
      (
        await db.query<any>(
          "SELECT state FROM web_task_reminders WHERE state='skipped'",
        )
      ).rows.length,
      1,
    );
    await db.exec("UPDATE web_tasks SET status='in_progress'");
    const recurrence = {
      frequency: "daily",
      interval: 1,
      end: "count",
      count: 3,
    };
    await saveReminder(
      { action: "create", taskId: "1", when: "2099-02-01T07:30", recurrence },
      "a@example.com",
    );
    await db.exec(
      "UPDATE web_task_reminders SET scheduled_at=now()-interval '1 minute' WHERE state='pending'",
    );
    const first = (await claimReminders("https://app.example"))[0];
    await acknowledgeReminder(first.id.split(":")[1], first.token);
    await acknowledgeReminder(first.id.split(":")[1], first.token);
    const repeated = (await listReminders("1")).filter((r) => r.series_id);
    assert.equal(repeated.length, 2);
    assert.equal(repeated.filter((r) => r.state === "pending").length, 1);
    const next = repeated.find((r) => r.state === "pending");
    assert.equal(
      new Date(next.scheduled_at).toISOString(),
      "2099-02-02T10:30:00.000Z",
    );
    await saveReminder(
      { action: "cancel", taskId: "1", id: next.id },
      "a@example.com",
    );
    assert.equal(
      (await db.query<any>("SELECT active FROM web_task_reminder_series"))
        .rows[0].active,
      false,
    );
    await saveReminder(
      { action: "create", taskId: "1", when: "2099-03-01T07:30", recurrence },
      "a@example.com",
    );
    await db.exec(
      "UPDATE web_tasks SET status='completed';UPDATE web_tasks SET status='in_progress'",
    );
    assert.equal(
      (
        await db.query<any>(
          "SELECT count(*)::int n FROM web_task_reminder_series WHERE active",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "SELECT count(*)::int n FROM web_task_reminders WHERE series_id IS NOT NULL AND state='pending'",
        )
      ).rows[0].n,
      0,
    );
    await saveReminder({action:"create",taskId:"1",when:"2099-04-01T08:00"},"a@example.com");
    let editable = (await listReminders("1")).find(r=>new Date(r.scheduled_at).toISOString()==="2099-04-01T11:00:00.000Z")!;
    const edit = {action:"edit",taskId:"1",id:editable.id,expectedWhen:new Date(editable.scheduled_at).toISOString(),when:"2099-04-02T09:00",recurrence};
    await saveReminder(edit,"a@example.com");
    editable = (await listReminders("1")).find(r=>r.id===editable.id)!;
    assert.equal(new Date(editable.scheduled_at).toISOString(),"2099-04-02T12:00:00.000Z");
    assert.ok(editable.series_id);
    assert.equal(editable.recipient_name,"Pessoa");
    await assert.rejects(()=>saveReminder(edit,"a@example.com"),/alterado/);
    const previousSeries=editable.series_id;
    await saveReminder({...edit,expectedWhen:new Date(editable.scheduled_at).toISOString(),when:"2099-04-03T09:00",recurrence:null},"a@example.com");
    editable=(await listReminders("1")).find(r=>r.id===editable.id)!;
    assert.equal(editable.series_id,null);
    assert.equal((await db.query<any>("SELECT active FROM web_task_reminder_series WHERE id=$1",[previousSeries])).rows[0].active,false);
    await db.query("UPDATE web_task_reminders SET leased_until=now()+interval '30 minutes' WHERE id=$1",[editable.id]);
    await assert.rejects(()=>saveReminder({...edit,expectedWhen:new Date(editable.scheduled_at).toISOString()},"a@example.com"),/em envio/);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
