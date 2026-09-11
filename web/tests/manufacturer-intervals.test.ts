import { test } from "node:test";
import assert from "node:assert/strict";
import {
  intervalInfo,
  intervalOptions,
  matchesInterval,
} from "../lib/manufacturer/intervals";
const entry = (hours: number) => ({
  interval_original: String(hours),
  interval_hours: hours,
});
test("revisions include only recurring divisors, including conditional periods once", () => {
  const entries = [2000, 4000, 6000, 8000, 16000, 24000].map(entry);
  const matched = (n: number) =>
    entries
      .filter((e) => matchesInterval(e, "h:" + n))
      .map((e) => e.interval_hours);
  assert.deepEqual(matched(8000), [2000, 4000, 8000]);
  assert.deepEqual(matched(6000), [2000, 6000]);
  assert.deepEqual(matched(24000), [2000, 4000, 6000, 8000, 24000]);
  const conditional = { interval_original: "6000 / 8000" };
  assert.equal(matchesInterval(conditional, "h:8000"), true);
  assert.equal(matchesInterval(conditional, "h:4000"), false);
  const options = intervalOptions([...entries, conditional]);
  assert.equal(options.find((o) => o.value === "h:24000")?.count, 6);
  assert.equal(intervalInfo(conditional).kind, "conditional");
  assert.equal(
    intervalOptions([conditional]).find((o) => o.value === "h:8000")?.count,
    1,
  );
});
test("unknown intervals remain separately selectable and invalid revisions do not match", () => {
  for (const e of [
    { interval_original: "" },
    { interval_original: "OBSOLETO" },
    entry(1614648780),
  ]) {
    assert.equal(matchesInterval(e, "h:8000"), false);
    assert.equal(matchesInterval(e, intervalInfo(e).value), true);
    assert.equal(matchesInterval(e, ""), true);
  }
  for (const selected of ["h:0", "h:NaN", "h:-1", "h:Infinity", "h:1614648780"])
    assert.equal(matchesInterval(entry(2000), selected), false);
  assert.deepEqual(intervalOptions([]), []);
});
