import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orderReport,
  canIncludeInOrderReport,
} from "../lib/service-scheduling/order-report";
import { renderChecklistPdf } from "../lib/service-scheduling/checklist-pdf";
import { PDFDocument } from "pdf-lib";
import { writeFileSync } from "node:fs";

function operation(id: string, position: number) {
  return {
    id,
    position,
    status: "reviewed",
    document: {
      description: `Atendimento ${position}`,
      responsible: "tech",
      checklistRun: {
        template: {
          name: "Corretiva",
          stages: [
            {
              id: "s",
              name: "Medições",
              fields: [
                { id: "hours", type: "meter", label: "Horímetro" },
                { id: "empty", type: "text", label: "Campo vazio" },
                {
                  id: "condition",
                  type: "flag",
                  label: "Condição",
                  options: ["OK", "NOK", "NA"],
                  internalNote: true,
                },
              ],
            },
          ],
        },
        stages: {
          s: {
            status: "submitted",
            answers: { hours: 1000 * position, condition: "OK" },
            details: { condition: { internalNote: "Nota interna" } },
          },
        },
      },
    },
  };
}
const sessions = [
  {
    id: "s1",
    operation_id: "one",
    actor: "tech",
    kind: "work",
    state: "finished",
    active_seconds: 1800,
    pause_seconds: 300,
    started_at: "2026-09-30T12:00:00Z",
    finished_at: "2026-09-30T12:35:00Z",
  },
  {
    id: "s2",
    operation_id: "two",
    actor: "tech",
    kind: "travel",
    state: "finished",
    active_seconds: 3600,
    pause_seconds: 0,
    started_at: "2026-09-29T12:00:00Z",
    finished_at: "2026-09-29T13:00:00Z",
  },
  {
    id: "excluded",
    operation_id: "other",
    actor: "outsider",
    kind: "work",
    state: "finished",
    active_seconds: 99999,
    pause_seconds: 0,
    started_at: "2026-09-28T12:00:00Z",
    finished_at: "2026-09-28T13:00:00Z",
  },
];
const data = {
  schedule: { order_id: 14877 },
  detail: {
    order: {
      cliente_nome: "Cliente",
      equipamento: "Compressor",
      numero_sequencia: 14877,
    },
  },
  users: [{ email: "tech", display_name: "Técnico" }],
  operations: [operation("one", 1), operation("two", 2), operation("other", 3)],
  fieldSessions: sessions,
  events: [
    {
      id: 1,
      operation_id: "one",
      actor: "tech",
      action: "work_log",
      hours: 0.5,
      created_at: "2026-09-30T12:35:00Z",
    },
  ],
};
test("unified report orders by actual dates, keeps readings separate, and scopes totals without mirrored duplicates", () => {
  const report = orderReport(data, ["one", "two"]);
  assert.deepEqual(
    report.chapters.map((c) => c.position),
    [2, 1],
  );
  assert.equal(
    report.report.find((s) => s.id === "timeline")!.groups[0].fields.length,
    2,
  );
  assert.match(
    String(
      report.report.find((s) => s.id === "timeline")!.groups[0].fields[0]
        .operation,
    ),
    /Operação 02/,
  );
  const totals = report.report.find((s) => s.id === "totals")!.groups[0].fields;
  assert.equal(totals[0].value, "00:30:00");
  assert.equal(totals[1].value, "01:00:00");
  assert.equal(totals.at(-1)!.value, "01:35:00");
  assert.ok(!JSON.stringify(report).includes("outsider"));
  assert.deepEqual(
    report.chapters.map(
      (c) => c.report.find((s) => s.id === "s")!.groups[0].fields[0].value,
    ),
    [2000, 1000],
  );
  assert.ok(
    report.chapters.every(
      (c) =>
        !c.report.some((s) => ["asset", "client", "location"].includes(s.id)),
    ),
  );
});
test("unified report modes retain zero, flags and budget notes while excluding unreviewed operations", () => {
  const copy = structuredClone(data);
  copy.operations[0].document.checklistRun.stages.s.answers.hours = 0;
  copy.operations[2].status = "awaiting_review";
  assert.equal(canIncludeInOrderReport(copy.operations[2]), false);
  for (const mode of ["complete", "summary", "budget"] as const) {
    const report = orderReport(copy, ["one", "other"], mode),
      json = JSON.stringify(report);
    assert.equal(report.chapters.length, 1);
    assert.equal(json.includes("Campo vazio"), mode === "complete");
    assert.equal(json.includes("Tempo de paradas"), mode === "complete");
    assert.equal(json.includes("Nota interna"), mode === "budget");
    assert.equal(
      report.chapters[0].report.find((s) => s.id === "s")!.groups[0].fields[0]
        .value,
      0,
    );
    assert.ok(json.includes("NOK"));
  }
});
test("unified report handles missing timestamps and starts each operation on a separate PDF page", async () => {
  const undated = orderReport({ ...data, fieldSessions: [], events: [] }, [
    "one",
    "two",
  ]);
  assert.deepEqual(
    undated.chapters.map((c) => c.position),
    [1, 2],
  );
  assert.ok(!JSON.stringify(undated).includes("Invalid Date"));
  const model = orderReport(data, ["one", "two"], "summary");
  const bytes = await renderChecklistPdf({
    ...model,
    client: "",
    equipment: "",
    photos: [],
  });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 3);
  writeFileSync("/tmp/order-report-unified.pdf", bytes);
});

test("operation milestones use execution dates and actual executors once per operation", () => {
  const copy: any = structuredClone(data);
  copy.users.push({ email: "support", display_name: "Apoio" });
  copy.fieldSessions.push({
    ...sessions[0],
    id: "support-work",
    actor: "support",
    started_at: "2026-09-30T13:00:00Z",
  });
  copy.fieldSessions.push({
    ...sessions[0],
    id: "early-travel",
    kind: "travel",
    actor: "driver",
    started_at: "2026-09-28T13:00:00Z",
  });
  const model = orderReport(copy, ["one", "two"]);
  const fields = model.report.find((s) => s.id === "timeline")!.groups[0]
    .fields;
  assert.deepEqual(
    fields.map((f) => f.operation),
    ["Operação 02", "Operação 01"],
  );
  assert.equal(fields[1].label, "30/09/2026");
  assert.equal(fields[1].value, "Atendimento 1");
  assert.deepEqual(fields[1].responsible?.split(", ").sort(), [
    "Apoio",
    "Técnico",
  ]);
  const unknown = orderReport({ ...copy, fieldSessions: [], events: [] }, [
    "one",
  ]);
  assert.equal(
    unknown.report.find((s) => s.id === "timeline")!.groups[0].fields[0].label,
    "Data não registrada",
  );
});
test('summary export keeps three totals per operation and removes professional breakdown from the overview',()=>{
 const model=orderReport(data,['one','two'],'summary');
 const overview=model.report.find(s=>s.id==='totals')!;
 assert.equal(overview.groups.length,1);
 assert.equal(overview.groups[0].fields.length,3);
 for(const chapter of model.chapters){
  const logs=chapter.report.find(s=>s.id==='events')!;
  assert.equal(logs.groups.length,1);
  assert.equal(logs.groups[0].fields.length,3);
  assert.equal(logs.groups[0].name,'Totais da operação');
 }
 assert.equal(model.chapters[0].report.find(s=>s.id==='events')!.groups[0].fields[2].value,'01:00:00');
 assert.equal(model.chapters[1].report.find(s=>s.id==='events')!.groups[0].fields[2].value,'00:30:00');
 for(const mode of ['complete','budget'] as const){
  assert.ok(orderReport(data,['one','two'],mode).report.find(s=>s.id==='totals')!.groups.length>1);
 }
});
