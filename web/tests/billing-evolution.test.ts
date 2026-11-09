import { test } from "node:test";
import assert from "node:assert/strict";
import history from "../lib/billing-evolution/history.json";
import {
  buildEvolution,
  periodTotal,
  comparableGrowth,
} from "../lib/billing-evolution/model";
const data = (live: Parameters<typeof buildEvolution>[1] = []) =>
  buildEvolution(history, live, "2026-11-09", null);
test("workbook totals reconcile; annual history has no invented months", () => {
  assert.equal(history.records.length, 36);
  for (const r of history.records)
    if (r.annualOnly) assert.ok(r.months.every((n) => n === null));
    else
      assert.ok(
        Math.abs(
          r.months.reduce<number>((a, b) => a + (b ?? 0), 0) - (r.total ?? 0),
        ) < 0.03,
      );
  const r = data().series[1].years.find((r) => r.year === 2010)!;
  assert.equal(r.total, 789512.6);
  assert.equal(periodTotal(r, 1, 9), null);
});
test("system overrides including zero, excludes future and consolidates without duplication", () => {
  const original = data(),
    result = data([
      { company: "1", period: "2026-01", amount: 0, count: 1 },
      { company: "1", period: "2026-12", amount: 999, count: 1 },
    ]);
  const r = result.series[1].years.at(-1)!;
  assert.equal(r.months[0].amount, 0);
  assert.equal(r.months[0].source, "system");
  assert.equal(r.months[11].amount, null);
  const g = result.series[0].years.at(-1)!.months[0];
  assert.equal(g.source, "mixed");
  assert.ok(
    Math.abs(
      g.amount! -
        original.series
          .slice(2)
          .reduce((sum, s) => sum + (s.years.at(-1)!.months[0].amount ?? 0), 0),
    ) < 0.01,
  );
});
test("preserves original consolidated historical coverage and missing company history", () => {
  const r = data().series[0].years.find((r) => r.year === 2019)!;
  assert.equal(r.months[0].amount, null);
  assert.equal(r.total, 3005047.8);
  assert.equal(
    data().series[3].years.find((r) => r.year === 2020)!.total,
    null,
  );
});
test("growth compares common months", () => {
  const r = data().series[1].years.at(-1)!;
  const previous = {
    ...r,
    months: r.months.map((c, i) => ({ ...c, amount: i < 9 ? 100 : 10000 })),
  };
  const current = {
    ...r,
    months: r.months.map((c, i) => ({ ...c, amount: i < 9 ? 110 : null })),
  };
  assert.ok(Math.abs(comparableGrowth(current, previous)! - 10) < 0.0001);
  assert.equal(comparableGrowth(current, undefined), null);
});

test("records distinguish month/year/base, retain ties and ignore missing values", async () => {
  const { billingRecords } = await import("../lib/billing-evolution/model");
  const template = data().series[1].years[0];
  const year = (year: number, values: (number | null)[]) => ({
    ...template,
    year,
    months: Array.from({ length: 12 }, (_, i) => ({
      amount: values[i] ?? null,
      source: null,
      count: 0,
    })),
  });
  const a = year(2024, [100, 200]),
    b = year(2025, [100, 150]),
    hidden = year(2020, [900]);
  const records = billingRecords([a, b], [hidden, a, b]);
  assert.deepEqual(records(2024, 0, 100), ["Melhor do mês"]);
  assert.deepEqual(records(2025, 0, 100), ["Melhor do mês"]);
  assert.deepEqual(records(2024, 1, 200), ["Melhor do mês", "Melhor do ano"]);
  assert.deepEqual(records(2025, 1, 150), ["Melhor do ano"]);
  assert.deepEqual(records(2025, 2, null), []);
  assert.deepEqual(billingRecords([hidden], [hidden, a, b])(2020, 0, 900), [
    "Melhor do mês",
    "Melhor do ano",
    "Recorde da base",
  ]);
  assert.deepEqual(billingRecords([a, b], [hidden, a, b], 1, 1)(2025, 0, 100), [
    "Melhor do mês",
    "Melhor do ano",
  ]);
});

test("breakdown reconciles gross minus returns, including returns-only months and unknown history", async () => {
  const { billingBreakdown } = await import("../lib/billing-evolution/model");
  const result = data([
    {
      company: "1",
      period: "2026-10",
      amount: 800,
      gross: 1000,
      returns: 200,
      count: 2,
      returnCount: 1,
    },
    {
      company: "2",
      period: "2026-10",
      amount: -50,
      gross: 0,
      returns: 50,
      count: 0,
      returnCount: 1,
    },
    {
      company: "27404",
      period: "2026-10",
      amount: 300,
      gross: 300,
      returns: 0,
      count: 1,
      returnCount: 0,
    },
  ]);
  const rows = billingBreakdown(result, "all", 2026, 10, 10);
  assert.equal(rows[0].gross, 1000);
  assert.equal(rows[0].returns, 200);
  assert.equal(rows[0].net, 800);
  assert.equal(rows[1].net, -50);
  assert.equal(rows[1].returnCount, 1);
  assert.equal(
    rows.reduce((n, r) => n + r.net!, 0),
    1050,
  );
  assert.equal(result.series[0].years.at(-1)!.months[9].amount, 1050);
  const historical = billingBreakdown(result, "1", 2026, 9, 10)[0];
  assert.equal(historical.net, null);
  assert.equal(historical.returns, null);
  assert.equal(historical.historical, true);
  assert.equal(billingBreakdown(result, "1", 2010, 1, 12)[0].gross, null);
});
