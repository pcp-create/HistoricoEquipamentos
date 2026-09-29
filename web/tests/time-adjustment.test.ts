import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTimeAdjustment } from "../lib/service-scheduling/time-adjustment";
import { timeLogs } from "../lib/service-scheduling/time-logs";
const t = (hour: number) =>
  `2026-01-01T${String(hour).padStart(2, "0")}:00:00Z`;
test("adjustments validate times and pauses, including future, overlapping and out-of-range entries", () => {
  const p = {
    started_at: t(8),
    finished_at: t(12),
    pauses: [{ start: t(9), end: t(10), reason: "Intervalo" }],
  };
  assert.equal(validateTimeAdjustment(p).active_seconds, 10800);
  assert.throws(
    () => validateTimeAdjustment({ ...p, finished_at: t(7) }),
    /término/,
  );
  assert.throws(() => validateTimeAdjustment(p, Date.parse(t(10))), /futuro/);
  assert.throws(
    () => validateTimeAdjustment({ ...p, started_at: "2026-01-01T08:00" }),
    /fuso/,
  );
  assert.throws(
    () =>
      validateTimeAdjustment({
        ...p,
        pauses: [...p.pauses, { start: t(9), end: t(11), reason: "Duplicada" }],
      }),
    /sobreposição/,
  );
  assert.throws(
    () =>
      validateTimeAdjustment({
        ...p,
        pauses: [{ start: t(7), end: t(9), reason: "Fora" }],
      }),
    /dentro/,
  );
  const r = timeLogs(
    [
      {
        id: "a",
        actor: "x",
        operation_id: "o",
        kind: "work",
        state: "finished",
        started_at: t(8),
        finished_at: t(10),
        active_seconds: 7200,
        pause_seconds: 0,
        correction: validateTimeAdjustment(p),
      },
    ],
    [],
    [
      {
        id: 1,
        actor: "x",
        operation_id: "o",
        action: "work_log",
        hours: 3,
        created_at: t(10),
      },
    ],
  );
  assert.equal(r.summary.count, 1);
  assert.equal(r.summary.work, 10800);
  assert.equal(r.summary.pause, 3600);
});
