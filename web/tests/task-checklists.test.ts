import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { changeChecklist, taskChecklists } from "../lib/tasks/checklists";
import { Forbidden } from "../lib/auth";
test("checklists persist, sort completed items last, reopen and reject stale and unrelated changes", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec(
      "CREATE TABLE web_user_access(email text,enabled boolean,role text); INSERT INTO web_user_access VALUES('user@test',true,'user'),('admin@test',true,'admin'),('disabled@test',false,'admin'); CREATE TABLE web_tasks(id bigint PRIMARY KEY,restricted boolean); INSERT INTO web_tasks VALUES(1,false),(2,false),(3,true)",
    );
    await db.exec(
      readFileSync(
        new URL("../sql/079_task_checklists.sql", import.meta.url),
        "utf8",
      ),
    );
    const query = (sql: string, args?: any[]) =>
      db.query(sql.replace("BEGIN READ WRITE", "BEGIN"), args);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const list = "11111111-1111-4111-8111-111111111111",
      one = "22222222-2222-4222-8222-222222222222",
      two = "33333333-3333-4333-8333-333333333333";
    await changeChecklist(
      { action: "create_list", id: list, taskId: "1", title: "Preparação" },
      "user@test",
    );
    for (const [id, title] of [
      [one, "Primeiro"],
      [two, "Segundo"],
    ])
      await changeChecklist(
        { action: "add_item", id, listId: list, taskId: "1", title },
        "user@test",
      );
    const done = await changeChecklist(
      { action: "toggle", id: one, taskId: "1", version: 1, completed: true },
      "user@test",
    );
    assert.deepEqual(
      done.lists[0].items.map((i: any) => i.id),
      [two, one],
    );
    assert.equal(done.lists[0].items[1].completed, true);
    const stored = (
      await db.query<any>(
        "SELECT completed_by,completed_at FROM web_task_checklist_items WHERE id=$1",
        [one],
      )
    ).rows[0];
    assert.equal(stored.completed_by, "user@test");
    assert.ok(stored.completed_at);
    await assert.rejects(
      () =>
        changeChecklist(
          {
            action: "toggle",
            id: one,
            taskId: "1",
            version: 1,
            completed: false,
          },
          "user@test",
        ),
      /alterado/,
    );
    await assert.rejects(
      () =>
        changeChecklist(
          {
            action: "toggle",
            id: one,
            taskId: "2",
            version: 2,
            completed: false,
          },
          "user@test",
        ),
      /alterado/,
    );
    await assert.rejects(
      () =>
        changeChecklist(
          {
            action: "add_item",
            id: two,
            listId: list,
            taskId: "2",
            title: "Não pode",
          },
          "user@test",
        ),
      /nesta tarefa/,
    );
    await assert.rejects(() => taskChecklists("3", "user@test"), Forbidden);
    await assert.rejects(() => taskChecklists("1", "disabled@test"), Forbidden);
    await assert.rejects(
      () =>
        changeChecklist(
          { action: "create_list", id: list, taskId: "1", title: " " },
          "user@test",
        ),
      /título/,
    );
    await changeChecklist(
      { action: "toggle", id: one, taskId: "1", version: 2, completed: false },
      "user@test",
    );
    await assert.rejects(() => changeChecklist(
      {action: "edit_item", id: one, taskId: "1", version: 3, title: " "}, "user@test"), /título/);
    await assert.rejects(() => changeChecklist(
      {action: "delete_item", id: one, taskId: "2", version: 3}, "user@test"), /alterado/);
    const edited = await changeChecklist(
      {action: "edit_item", id: one, taskId: "1", version: 3, title: "Revisado"}, "user@test");
    assert.equal(edited.lists[0].items.find((i: any) => i.id === one).title, "Revisado");
    await assert.rejects(() => changeChecklist(
      {action: "delete_item", id: one, taskId: "1", version: 3}, "user@test"), /alterado/);
    const deleted = await changeChecklist(
      {action: "delete_item", id: one, taskId: "1", version: 4}, "user@test");
    assert.equal(deleted.lists[0].items.length, 1);
    await assert.rejects(() => changeChecklist(
      {action:"rename_list", id:list, taskId:"2", title:"Outro", previousTitle:"Preparação"}, "user@test"), /alterada/);
    await assert.rejects(() => changeChecklist(
      {action:"rename_list", id:list, taskId:"1", title:" ", previousTitle:"Preparação"}, "user@test"), /título/);
    const renamed = await changeChecklist(
      {action:"rename_list", id:list, taskId:"1", title:"Nova preparação", previousTitle:"Preparação"}, "user@test");
    assert.equal(renamed.lists[0].title, "Nova preparação");
    await assert.rejects(() => changeChecklist(
      {action:"rename_list", id:list, taskId:"1", title:"Conflito", previousTitle:"Preparação"}, "user@test"), /alterada/);
    const read = await taskChecklists("1", "user@test");
    assert.equal(read.lists[0].items.filter((i: any) => i.completed).length, 0);
    assert.equal((await taskChecklists("2", "user@test")).lists.length, 0);
    await assert.rejects(() => changeChecklist({action:"delete_list",id:list,taskId:"2",previousTitle:"Nova preparação"},"user@test"), /alterada/);
    await assert.rejects(() => changeChecklist({action:"delete_list",id:list,taskId:"1",previousTitle:"Preparação"},"user@test"), /alterada/);
    const removed = await changeChecklist({action:"delete_list",id:list,taskId:"1",previousTitle:"Nova preparação"},"user@test");
    assert.equal(removed.lists.length,0);
    assert.equal((await db.query("SELECT * FROM web_task_checklist_items")).rows.length,0);
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
