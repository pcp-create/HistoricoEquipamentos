import { test } from "node:test";
import assert from "node:assert/strict";
import { compareProjection } from "../lib/sales-projection/comparison";
import type { Detail } from "../lib/sales-projection/model";
const row = (overrides: Partial<Detail> = {}): Detail => ({ company: 1, kind: "salesPending", id: "10", name: "Cliente", date: "2026-10-01", amount: 100, ...overrides });
test("billing a pending OS is a change, not an entry and exit", () => {
  const changes = compareProjection([row()], [row({ kind: "salesBilled" })]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "Alteração");
  assert.deepEqual(changes[0].changes, ["Situação"]);
});
test("captures additions, removals, value/date/flow changes and keeps companies distinct", () => {
  const before = [row(), row({ company: 2 }), row({ id: "11" })];
  const after = [row({ amount: 150, fields: { expected: "2026-11-01", flowOwner: "Compras" } }), row({ id: "12" })];
  const changes = compareProjection(before, after);
  assert.equal(changes.filter((c) => c.type === "Saída").length, 2);
  assert.equal(changes.filter((c) => c.type === "Entrada").length, 1);
  assert.deepEqual(changes[0].changes, ["Valor", "Entrega prevista", "Responsável do fluxo"]);
  assert.equal(before[0].amount, 100);
});
test("ignores diagnostic metadata and isolates return sources with equal IDs", () => {
  assert.equal(compareProjection([row()], [row({ programming: { status: "pending", label: "Pendente" } })]).length, 0);
  const returns = ["fDevolucoesCompra", "fDevolucoesOutros"].map((sourceKind) => row({ kind: "returns", sourceKind }));
  assert.equal(compareProjection([], returns).length, 2);
});
test("invoice reclassification remains a change and monetary comparison uses cents", () => {
  const before = row({ kind: "invoices", amount: 0.1 + 0.2 });
  const after = row({ kind: "contractBilled", amount: 0.3 });
  assert.deepEqual(compareProjection([before], [after])[0].changes, ["Situação"]);
});
