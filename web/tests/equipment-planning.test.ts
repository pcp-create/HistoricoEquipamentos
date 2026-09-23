import { test } from "node:test";
import assert from "node:assert/strict";
import {
  predict,
  parseOperating,
  parsePlan,
  addMonths,
  emptyOperating,
  validDate,
} from "../lib/equipment-management/planning";
const plan = {
  name: "4.000 horas",
  hours: 4000,
  months: null,
  lastDate: "2026-09-14",
  lastMeter: 1000,
  notes: "",
  lastOrder: "",
};
const operating = { ...emptyOperating, hoursDay: 24, daysYear: 365 };
test("preventive hours count from last intervention, not absolute meter multiples", () => {
  const result = predict(plan, operating, "2026-09-14");
  assert.equal(result.target, 5000);
  assert.equal(result.days, 167);
  assert.equal(result.due, "2027-02-28");
  assert.equal(
    predict({ ...plan, months: 3 }, operating, "2026-09-14").due,
    "2026-12-14",
  );
  assert.equal(
    predict({ ...plan, hours: null, months: 8 }, emptyOperating, "2026-09-14")
      .due,
    "2027-05-14",
  );
});
test("readings override projection and missing data never gives false scheduled status", () => {
  const read = { ...operating, meter: 4990, meterDate: "2026-10-01" };
  assert.equal(predict(plan, read, "2026-10-01").days, 1);
  assert.equal(
    predict(
      plan,
      { ...emptyOperating, meter: 5100, meterDate: "2026-10-01" },
      "2026-10-01",
    ).measuredDue,
    true,
  );
  assert.equal(
    predict(plan, emptyOperating, "2026-10-01").status,
    "incomplete",
  );
  assert.equal(
    predict({ ...plan, lastMeter: null }, operating, "2026-10-01").status,
    "incomplete",
  );
  assert.equal(
    predict(plan, { ...read, meter: 900 }, "2026-10-01").inconsistent,
    true,
  );
  assert.equal(
    predict({ ...plan, months: 1 }, emptyOperating, "2026-10-01").incomplete,
    true,
  );
  assert.equal(
    predict(plan, { ...operating, hoursDay: 0.001, daysYear: 1 }, "2026-09-14")
      .status,
    "incomplete",
  );
  assert.equal(predict(plan, operating, "2027-03-02").status, "overdue");
});
test("calendar dates clamp months and inputs reject impossible dates and regimes", () => {
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2025-01-31", 1), "2025-02-28");
  assert.equal(validDate("2026-02-30"), false);
  for (const patch of [
    { hoursDay: 25 },
    { daysYear: 366 },
    { meter: 100, meterDate: "" },
    { meter: -1, meterDate: "2026-01-01" },
  ])
    assert.throws(() => parseOperating({ ...operating, ...patch }));
  assert.throws(() => parsePlan({ ...plan, hours: null, months: null }));
  assert.throws(() => parsePlan({ ...plan, lastDate: "2026-02-30" }));
  assert.equal(
    parsePlan({ ...plan, lastDate: "", lastMeter: null }).lastDate,
    "",
  );
});

test("current meter estimates elapsed usage and rejects missing or future readings", async () => {
  const { estimateCurrentMeter, emptyOperating } =
    await import("../lib/equipment-management/planning");
  const op = {
    ...emptyOperating,
    meter: 1000,
    meterDate: "2026-09-14",
    hoursDay: 24,
    daysYear: 365,
  };
  assert.equal(estimateCurrentMeter(op, "2026-09-16"), 1048);
  assert.equal(
    estimateCurrentMeter({ ...op, daysYear: 182 }, "2026-09-16"),
    1000 + (48 * 182) / 365,
  );
  assert.equal(estimateCurrentMeter({ ...op, meter: 0 }, "2026-09-14"), 0);
  assert.equal(
    estimateCurrentMeter({ ...op, hoursDay: null }, "2026-09-16"),
    null,
  );
  assert.equal(estimateCurrentMeter(op, "2026-09-13"), null);
});

test("rental meter excludes idle gaps and merges overlapping commitments", async () => {
  const { estimateCurrentMeter, emptyOperating } =
    await import("../lib/equipment-management/planning");
  const op = {
    ...emptyOperating,
    meter: 1000,
    meterDate: "2026-09-01",
    hoursDay: 24,
    daysYear: 365,
  };
  const usage = {
    incomplete: false,
    intervals: [
      { start: "2026-09-01", end: "2026-09-03" },
      { start: "2026-09-10", end: null },
    ],
  };
  assert.equal(estimateCurrentMeter(op, "2026-09-12", usage), 1096);
  assert.equal(estimateCurrentMeter(op, "2026-09-09", usage), 1048);
  assert.equal(
    estimateCurrentMeter(op, "2026-09-12", {
      incomplete: false,
      intervals: [],
    }),
    1000,
  );
  assert.equal(
    estimateCurrentMeter(op, "2026-09-12", { ...usage, incomplete: true }),
    null,
  );
  assert.equal(
    estimateCurrentMeter(op, "2026-09-12", {
      ...usage,
      intervals: [...usage.intervals, { start: "2026-09-10", end: null }],
    }),
    1096,
  );
});

test("larger revision resets lower intervals but preserves newer interventions", async () => {
  const { cascadeIntervention, preventiveMonths } =
    await import("../lib/equipment-management/planning");
  const large = {
    ...plan,
    hours: 24000,
    lastDate: "2026-09-20",
    lastMeter: 25000,
    lastOrder: "14153",
  };
  for (const hours of [2000, 4000, 8000, 16000]) {
    const result = cascadeIntervention({ ...plan, hours }, large)!;
    assert.equal(result.lastMeter, 25000);
    assert.equal(result.lastDate, "2026-09-20");
    assert.equal(result.lastOrder, "14153");
    assert.equal(result.hours, hours);
  }
  assert.equal(
    cascadeIntervention({ ...plan, lastDate: "2026-09-21" }, large),
    null,
  );
  assert.equal(cascadeIntervention({ ...plan, hours: 32000 }, large), null);
  assert.equal(cascadeIntervention({ ...plan, lastMeter: 26000 }, large), null);
  for (const [hours, months] of [
    [2000, 6],
    [4000, 12],
    [8000, 24],
    [20000, 60],
    [24000, 60],
  ])
    assert.equal(preventiveMonths(hours), months);
});

test("plan items accept materials and services, reject duplicates and invalid quantities", () => {
  const item = {
    kind: "material",
    code: "10027",
    name: "Filtro",
    unit: "UN",
    quantity: "1.5",
  };
  assert.equal(parsePlan({ ...plan, items: [item] }).items?.length, 1);
  assert.deepEqual(parsePlan(plan).items, []);
  assert.throws(() => parsePlan({ ...plan, items: [item, item] }), /já está/);
  for (const quantity of ["0", "-1", "abc", "1.1234", "1000001"])
    assert.throws(
      () => parsePlan({ ...plan, items: [{ ...item, quantity }] }),
      /quantidade/,
    );
  assert.equal(
    parsePlan({ ...plan, items: [item, { ...item, kind: "service" }] }).items
      ?.length,
    2,
  );
});
