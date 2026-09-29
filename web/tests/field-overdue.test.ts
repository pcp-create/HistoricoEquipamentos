import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldOperationOverdue } from "../lib/service-scheduling/field-overdue";
test("overdue uses the Brazil day and excludes finished field operations", () => {
  const now = Date.parse("2026-09-30T01:00:00Z"); // Still September 29 in Brasília.
  assert.equal(fieldOperationOverdue("2026-09-28", "executing", now), true);
  assert.equal(fieldOperationOverdue("2026-09-29", "scheduled", now), false);
  assert.equal(fieldOperationOverdue("2026-09-30", "scheduled", now), false);
  assert.equal(fieldOperationOverdue("", "pending", now), false);
  for (const status of ["awaiting_review", "reviewed", "completed"])
    assert.equal(fieldOperationOverdue("2026-09-28", status, now), false);
  assert.equal(fieldOperationOverdue("2026-09-29", "executing", Date.parse("2026-09-30T03:00:00Z")), true);
});
