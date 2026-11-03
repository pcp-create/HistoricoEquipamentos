import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayedScheduleStatus,
  displayedOperationCounts,
  displayedOperationStatus,
} from "../lib/service-scheduling/display-status";
test("reviewed OS and operation counts wait for internal or billing release, preserving ERP completion", () => {
  const s = { order_status: "Pendente", programming_status: "reviewed" };
  assert.equal(displayedScheduleStatus(s), "awaiting_review");
  assert.equal(
    displayedScheduleStatus({ ...s, programming_status: "release_pending" }),
    "awaiting_review",
  );
  assert.deepEqual(
    displayedOperationCounts(s, {
      awaiting_review: 2,
      reviewed: 3,
      completed: 1,
      executing: 1,
    }),
    { awaiting_review: 6, executing: 1 },
  );
  for (const release_kind of ["internal", "billing"]) {
    assert.equal(displayedScheduleStatus({ ...s, release_kind }), "reviewed");
    assert.equal(
      displayedOperationStatus({ ...s, release_kind }, "reviewed"),
      "reviewed",
    );
    assert.deepEqual(
      displayedOperationCounts(
        { ...s, release_kind },
        { reviewed: 3, completed: 1 },
      ),
      { reviewed: 4 },
    );
  }
  assert.equal(
    displayedScheduleStatus({ ...s, release_kind: "other" }),
    "awaiting_review",
  );
  assert.equal(
    displayedScheduleStatus({
      ...s,
      programming_status: "executing",
      release_kind: "billing",
    }),
    "executing",
  );
  assert.equal(
    displayedScheduleStatus({ ...s, order_status: "Processado" }),
    "completed",
  );
  assert.deepEqual(
    displayedOperationCounts(
      { ...s, order_status: "Processado" },
      { reviewed: 3, completed: 1 },
    ),
    { completed: 4 },
  );
  assert.equal(
    displayedScheduleStatus({
      ...s,
      order_status: "Cancelado",
      release_kind: "billing",
    }),
    "cancelled",
  );
});
