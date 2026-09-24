import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyTaskSummaries } from "../lib/tasks/daily-summary";
test("daily summaries isolate assignees, classify overdue once and exclude closed tasks", () => {
  const users = [
    {
      email: "a@example.com",
      display_name: "Pessoa A",
      phone: "5547999999999",
      enabled: true,
    },
    {
      email: "b@example.com",
      display_name: "Pessoa B",
      phone: "5547888888888",
      enabled: true,
    },
  ];
  const tasks = [
    { assigned_to: "a@example.com", status: "not_started" },
    {
      assigned_to: "a@example.com",
      status: "in_progress",
      due_date: "2026-09-23",
    },
    {
      assigned_to: "a@example.com",
      status: "in_progress",
      due_date: "2026-09-24",
    },
    { assigned_to: "a@example.com", status: "completed" },
    { assigned_to: "b@example.com", status: "not_started" },
    { assigned_to: null, status: "not_started" },
  ];
  const r = dailyTaskSummaries(
    tasks,
    users,
    "https://app.example",
    "2026-09-24",
  );
  assert.equal(r.unassigned, 1);
  assert.equal(r.summaries.length, 2);
  const a = r.summaries[0];
  assert.equal(a.total, 3);
  assert.equal(a.pending, 1);
  assert.equal(a.in_progress, 1);
  assert.equal(a.overdue, 1);
  assert.equal(r.summaries[1].total, 1);
  assert.match(a.text, /Pessoa A/);
  assert.doesNotMatch(a.text, /Pessoa B/);
  assert.equal(
    dailyTaskSummaries(
      tasks,
      users.map((u) => ({ ...u, enabled: false })),
      "https://app.example",
      "2026-09-24",
    ).summaries.length,
    0,
  );
  assert.equal(
    dailyTaskSummaries(
      tasks,
      users.map((u) => ({ ...u, phone: "" })),
      "https://app.example",
      "2026-09-24",
    ).skipped.length,
    2,
  );
});
