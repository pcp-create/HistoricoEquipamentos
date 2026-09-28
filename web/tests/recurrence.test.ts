import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRecurrence,
  occurrence,
  nextOccurrence,
} from "../lib/tasks/recurrence";
const rule = (extra: any = {}) =>
  parseRecurrence(
    { frequency: "daily", interval: 1, end: "never", ...extra },
    "2026-09-28T07:30",
  )!;
test("daily, multiweek weekdays, month ends and leap years preserve local time", () => {
  assert.equal(
    occurrence("2026-09-28T07:30", rule({ interval: 2 }), 1),
    "2026-09-30T07:30",
  );
  const weekly = rule({
    frequency: "weekly",
    interval: 2,
    weekdays: [1, 3, 5],
  });
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => occurrence("2026-09-28T07:30", weekly, i)),
    [
      "2026-09-28T07:30",
      "2026-09-30T07:30",
      "2026-10-02T07:30",
      "2026-10-12T07:30",
    ],
  );
  const monthly = rule({ frequency: "monthly" });
  assert.equal(occurrence("2027-01-31T07:30", monthly, 1), "2027-02-28T07:30");
  assert.equal(occurrence("2027-01-31T07:30", monthly, 2), "2027-03-31T07:30");
  assert.equal(
    occurrence("2028-02-29T07:30", rule({ frequency: "yearly" }), 1),
    "2029-02-28T07:30",
  );
  assert.equal(
    occurrence(
      "2028-01-15T07:30",
      rule({ frequency: "monthly", monthMode: "last_day" }),
      1,
    ),
    "2028-02-29T07:30",
  );
});
test("count includes first, until is inclusive, downtime skips past slots and malformed input fails", () => {
  assert.equal(
    nextOccurrence("2026-09-28T07:30", rule({ end: "count", count: 1 }), 0),
    null,
  );
  const until = rule({ end: "until", until: "2026-09-29" });
  assert.equal(
    nextOccurrence("2026-09-28T07:30", until, 0)?.when,
    "2026-09-29T10:30:00.000Z",
  );
  assert.equal(nextOccurrence("2026-09-28T07:30", until, 1), null);
  assert.equal(
    nextOccurrence(
      "2026-09-28T07:30",
      rule(),
      0,
      Date.parse("2026-10-01T12:00Z"),
    )?.when,
    "2026-10-02T10:30:00.000Z",
  );
  for (const input of [
    { interval: 0 },
    { interval: 1.5 },
    { frequency: "hourly" },
    { end: "count", count: 0 },
    { end: "until", until: "2026-02-30" },
    { frequency: "weekly", weekdays: [] },
    { frequency: "weekly", weekdays: [2] },
  ])
    assert.throws(() => rule(input));
});
