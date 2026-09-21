import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  reportMessage,
  type Source,
} from "../lib/preventive-reports/report";
import {
  emptyOperating,
  type Plan,
} from "../lib/equipment-management/planning";
import { reportTokenMatches } from "../lib/preventive-reports/access";
import { reportPdf } from "../lib/preventive-reports/pdf";
import { PDFDocument } from "pdf-lib";
const plan: Plan = {
  name: "Preventiva 2.000 h",
  hours: 2000,
  months: 6,
  lastDate: "2026-09-01",
  lastMeter: 100,
  notes: "",
  lastOrder: "1",
};
const source = (id: string, plans: Plan[], meter = 100): Source => ({
  id,
  name: "Máquina <script> & revisão",
  serial: "ABC",
  clients: "Cliente",
  plans,
  settings: {
    ...emptyOperating,
    meter,
    meterDate: "2026-09-21",
    hoursDay: 24,
    daysYear: 365,
  },
});
test("reports group by equipment urgency, exclude incomplete from OK and include 30-day boundary", () => {
  const entries = [
    source("1", [plan]),
    source("2", [plan], 2500),
    source("3", [{ ...plan, lastDate: "", lastMeter: null }]),
    source("4", [{ ...plan, hours: null, months: 1 }]),
    source("5", []),
  ];
  const weekly = buildReport(entries, "weekly", "2026-09-21"),
    daily = buildReport(entries, "overdue", "2026-09-21");
  assert.equal(weekly.equipmentCount, 1);
  assert.ok(weekly.rows.every((r) => r.status === "soon"));
  const monthly = buildReport(entries, "monthly", "2026-09-21");
  assert.equal(monthly.equipmentCount, 3);
  assert.ok(monthly.rows.some((r) => r.status === "scheduled"));
  assert.equal(daily.equipmentCount, 1);
  assert.equal(weekly.coverage.incomplete, 2);
  assert.equal(
    buildReport(
      [source("6", [plan, { ...plan, lastMeter: null, lastDate: "" }])],
      "weekly",
      "2026-09-21",
    ).equipmentCount,
    0,
  );
  const boundary = source("7", [
    { ...plan, hours: null, months: 1, lastDate: "2026-09-21" },
  ]);
  assert.equal(
    buildReport([boundary], "weekly", "2026-09-21").coverage.soon,
    1,
  );
});
test("rental idle hours use shared forecast; HTML is escaped and PDFs paginate", async () => {
  const e = source("1", [{ ...plan, months: null }]);
  e.settings.meterDate = "2026-01-01";
  e.usage = { intervals: [], incomplete: false };
  const report = buildReport([e], "weekly", "2026-09-21");
  assert.equal(report.coverage.overdue, 0);
  assert.equal(report.coverage.incomplete, 1);
  const populated = buildReport(
    Array.from({ length: 90 }, (_, i) => source(String(i), [plan])),
    "monthly",
    "2026-09-21",
  );
  assert.ok(!reportMessage(populated).html.includes("<script>"));
  assert.ok(reportMessage(populated).html.includes("&lt;script&gt;"));
  const pdf = await PDFDocument.load(await reportPdf(populated));
  assert.ok(pdf.getPageCount() > 1);
});
test("report token rejects missing, short or wrong credentials", () => {
  const secret = "a".repeat(64);
  assert.equal(reportTokenMatches(null, secret), false);
  assert.equal(reportTokenMatches("Bearer wrong", secret), false);
  assert.equal(reportTokenMatches("Bearer " + secret, undefined), false);
  assert.equal(reportTokenMatches("Bearer " + secret, secret), true);
});
