import { test } from "node:test";
import assert from "node:assert/strict";
import { itemApproval } from "../lib/material-approval";
import { toEditDraft } from "../lib/service-orders/edit";

test("approval uses explicit M8 values and keeps missing service approval unknown", () => {
  for (const value of [true, "Sim", " true "]) assert.equal(itemApproval(value), "approved");
  for (const value of [false, "Nao", "Não", "false"]) assert.equal(itemApproval(value), "rejected");
  for (const value of [null, undefined, "", "Pendente", 0]) assert.equal(itemApproval(value), "unknown");
  const draft = toEditDraft({
    produtos: [{id: 1, aprovado: "Sim"}, {id: 2, aprovado: "Nao"}, {id: 3}],
    servicos: [{id: 4, situacaoItemId: 1}],
  }, "2");
  assert.deepEqual(draft.items.map(item => item.approval), ["approved", "rejected", "unknown", "unknown"]);
});
