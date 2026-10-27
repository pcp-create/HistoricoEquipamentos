import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileBilling,
  orderReferences,
} from "../lib/sales-projection/billing";
import type { SourceRow } from "../lib/sales-projection/model";
const order = (id = "10", patch: Record<string, unknown> = {}): SourceRow => ({
  company_id: 1,
  id,
  payload: {
    empresaId: 1,
    clienteId: 22,
    numeroSequencia: Number(id),
    tipoDocumentoFiscal: 2,
    documentoFiscalId: 100,
    totalGeral: 1000,
    ...patch,
  },
});
const invoice = (
  id = "100",
  patch: Record<string, unknown> = {},
): SourceRow => ({
  company_id: 1,
  id,
  kind: "fFaturamento",
  payload: {
    empresaId: 1,
    pessoaId: 22,
    totalGeral: 400,
    status: "Processado",
    estaExcluido: false,
    emissao: "2026-10-01",
    observacao: "O.S. 10 MANUTENÇÃO",
    ...patch,
  },
});
const check = (orders: SourceRow[], invoices: SourceRow[]) =>
  reconcileBilling(orders, invoices).get("1:10")!;
test("parts plus complementary service invoice, including another month, fully reconcile", () => {
  const c = check(
    [order()],
    [
      invoice(),
      invoice("101", {
        totalGeral: 600,
        emissao: "2026-11-05",
        observacao: "COMPLEMENTO DA NFE 99. O.S. 10 SERVIÇO",
      }),
    ],
  );
  assert.equal(c.state, "matched");
  assert.equal(c.billed, 1000);
  assert.equal(c.balance, 0);
  assert.equal(c.documents.length, 2);
});
test("cancelled or deleted complement is evidence but never billed", () => {
  for (const patch of [{ status: "Cancelado" }, { estaExcluido: true }]) {
    const c = check(
      [order()],
      [invoice(), invoice("101", { totalGeral: 600, ...patch })],
    );
    assert.equal(c.state, "partial");
    assert.equal(c.balance, 600);
    assert.equal(c.billed, 400);
    assert.equal(c.documents.length, 2);
  }
});
test("missing links do not claim absence of billing and mismatched customer/company never match", () => {
  const c = check(
    [order()],
    [invoice("100", { pessoaId: 23 }), invoice("101", { empresaId: 2 })],
  );
  assert.equal(c.state, "unmatched");
  assert.equal(c.balance, null);
  assert.equal(c.documents.length, 0);
});
test("duplicate collection contexts do not double count one invoice", () => {
  const a = invoice();
  const c = check(
    [order()],
    [a, { ...a, company_id: 2 }, invoice("101", { totalGeral: 600 })],
  );
  assert.equal(c.billed, 1000);
  assert.equal(c.documents.length, 2);
});
test("shared invoices and aliases are ambiguous, never allocated twice", () => {
  const result = reconcileBilling(
    [order(), order("11", { documentoFiscalId: 101 })],
    [invoice("100", { observacao: "O.S. 10 e O.S. 11" })],
  );
  assert.equal(result.get("1:10")?.state, "review");
  assert.equal(result.get("1:11")?.state, "review");
  assert.equal(result.get("1:10")?.billed, 0);
  assert.equal(result.get("1:11")?.balance, null);
  const list = check([order()], [invoice("100", { observacao: "OS 10 / 11" })]);
  assert.equal(list.state, "review");
});
test("excess invoicing and missing amounts require review, not a negative balance", () => {
  assert.equal(
    check([order()], [invoice("100", { totalGeral: 1200 })]).state,
    "review",
  );
  assert.equal(
    check([order()], [invoice("100", { totalGeral: null })]).balance,
    null,
  );
  assert.equal(
    check([order()], [invoice("100", { totalGeral: 1200 })]).balance,
    null,
  );
});
test("OS references match exact IDs, including punctuation, never partial numbers", () => {
  assert.deepEqual(orderReferences("O.S. 101 - OS nº 12 - os: 10"), {
    ids: ["101", "12", "10"],
    list: false,
  });
  assert.equal(
    check(
      [order("10", { documentoFiscalId: null })],
      [invoice("100", { observacao: "OS 101" })],
    ).state,
    "unmatched",
  );
  assert.equal(
    check(
      [order("10", { numeroSequencia: 77, documentoFiscalId: null })],
      [invoice("100", { observacao: "OS 77" })],
    ).state,
    "partial",
  );
});

test("a direct link conflicting with an unresolved textual reference requires review", () => {
  const c = check([order()], [invoice("100", { observacao: "O.S. 99999" })]);
  assert.equal(c.state, "review");
  assert.equal(c.balance, null);
  assert.equal(c.billed, 0);
});

test("multiple structured M8 links reconcile invoices across months without textual OS references", () => {
  const links = ["100", "101", "101"].map(documento_fiscal_id => ({company_id:1, ordem_servico_id:"10", documento_fiscal_id}));
  const c = reconcileBilling([order("10", {documentoFiscalId:null})], [
    invoice("100", {observacao:"RELATÓRIO Nº 10", totalGeral:400}),
    invoice("101", {observacao:"", emissao:"2026-11-05", totalGeral:600}),
  ], links).get("1:10")!;
  assert.equal(c.state,"matched");
  assert.equal(c.billed,1000);
  assert.equal(c.balance,0);
  assert.deepEqual(c.documents.map(d=>[d.id,d.date,d.link]), [["100","2026-10-01","M8"],["101","2026-11-05","M8"]]);
});

test("structured links retain company/customer, cancellation and shared-invoice safeguards", () => {
  const link={company_id:1,ordem_servico_id:"10",documento_fiscal_id:"101"};
  const os=order("10",{documentoFiscalId:null});
  for (const patch of [{pessoaId:23},{empresaId:2}]) {
    assert.equal(reconcileBilling([os],[invoice("101",{observacao:"",...patch})],[link]).get("1:10")!.documents.length,0);
  }
  assert.equal(reconcileBilling([os],[invoice("101",{observacao:""})],[{...link,company_id:2}]).get("1:10")!.documents.length,0);
  for (const patch of [{status:"Cancelado"},{estaExcluido:true}]) {
    const c=reconcileBilling([os],[invoice("101",{observacao:"",...patch})],[link]).get("1:10")!;
    assert.equal(c.billed,0);
    assert.equal(c.documents.length,1);
  }
  const shared=reconcileBilling([os,order("11",{documentoFiscalId:null})],[invoice("101",{observacao:""})],[link,{...link,ordem_servico_id:"11"}]);
  assert.equal(shared.get("1:10")!.state,"review");
  assert.equal(shared.get("1:11")!.state,"review");
  assert.equal(shared.get("1:10")!.billed,0);
});
