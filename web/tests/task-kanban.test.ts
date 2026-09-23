import { test } from "node:test";
import assert from "node:assert/strict";
import { taskColumn } from "../lib/tasks/kanban";

test("vencimento passado prevalece sobre andamento e coluna manual", () => {
  for (const status of ["not_started", "in_progress"]) {
    for (const kanban_column of [null, "pending", "in_progress", "overdue"]) {
      assert.equal(
        taskColumn(
          { status, kanban_column, due_date: "2026-09-22" },
          "2026-09-23",
        ),
        "overdue",
      );
    }
  }
});

test("concluídas permanecem concluídas mesmo vencidas", () => {
  assert.equal(
    taskColumn({ status: "completed", due_date: "2026-09-22" }, "2026-09-23"),
    "completed",
  );
});

test("vencimento hoje, futuro ou ausente preserva andamento", () => {
  for (const due_date of ["2026-09-23", "2026-09-24", null]) {
    assert.equal(
      taskColumn(
        { status: "in_progress", kanban_column: "in_progress", due_date },
        "2026-09-23",
      ),
      "in_progress",
    );
  }
});

test("prorrogação retira atraso automático e preserva andamento", () => {
  const task = {
    status: "in_progress",
    kanban_column: "in_progress",
    due_date: "2026-09-22",
  };
  assert.equal(taskColumn(task, "2026-09-23"), "overdue");
  assert.equal(
    taskColumn({ ...task, due_date: "2026-09-24" }, "2026-09-23"),
    "in_progress",
  );
});
