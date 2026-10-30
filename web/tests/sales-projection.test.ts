import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projection,
  sumRows,
  type SourceRow,
} from "../lib/sales-projection/model";
import {contractSchedule} from "../../src/sync/contractSchedule";
const fact = (
  id: string,
  kind: string,
  c: number,
  payload: Record<string, unknown>,
): SourceRow => ({
  id,
  kind,
  company_id: c,
  payload: {
    status: "Processado",
    empresaId: c,
    emissao: "2026-10-01",
    ...payload,
    ...(kind === "fContratos" ? {_billingSchedule:contractSchedule(payload,[{id:1,inicioFaturamento:payload.inicio,finalFaturamento:payload.final,total:Number(payload.valor),periodicidadeFaturamento:"Mensal"}],[])} : {}),
  },
});
test("reference report final totals reconcile with returns separated", () => {
  const facts: SourceRow[] = [],
    orders: SourceRow[] = [];
  for (const [c, contract, cb, sb, sp, other, returns] of [
    [1, 97352.74, 97352.74, 353643.66, 373147.33, -2399.98, 1805.25],
    [2, 86083.86, 84155, 29535, 124274.43, 0, 0],
    [27404, 37000, 37000, 83294.4, 37216.34, 0, 0],
  ]) {
    facts.push(
      fact("c" + c, "fContratos", c, {
        inicio: "2026-10-01",
        final: "2026-10-31",
        valor: cb,
        pessoaId: 1,
        estabelecimentoId: c,
      }),
    );
    if (contract !== cb)
      facts.push(
        fact("p" + c, "fContratos", c, {
          inicio: "2026-10-01",
          final: "2026-10-31",
          valor: contract - cb,
          pessoaId: 2,
          estabelecimentoId: c,
        }),
      );
    facts.push(
      fact("i" + c, "fFaturamento", c, { pessoaId: 1, totalGeral: cb }),
      fact("v" + c, "fFaturamento", c, { pessoaId: 3, totalGeral: sb + other }),
      fact("d" + c, "fDevolucoesCompra", c, {
        tipoCompraDescricao: "DEVOLUÇÃO",
        totalGeral: returns,
      }),
    );
    orders.push(
      fact("o" + c, "", c, {
        situacaoNome: "COBRANÇA",
        status: "Processado",
        dataFaturamento: "2026-10-01",
        totalGeral: sb,
      }),
      fact("s" + c, "", c, {
        situacaoNome: "COBRANÇA",
        status: "Pendente",
        dataEntregaPrevista: "2026-10-30",
        totalGeral: sp,
      }),
    );
  }
  const t = sumRows(projection(facts, orders, "2026-10", "2026-10-26").rows);
  assert.equal(t.contractBilled, 218507.74);
  assert.equal(t.salesBilled, 466473.06);
  assert.equal(t.other, -2399.98);
  assert.equal(t.returns, 1805.25);
  assert.equal(t.billed, 680775.57);
  assert.equal(t.pending, 536566.96);
  assert.equal(t.projection, 1217342.53);
});
test("overdue orders use current month; costs and cancelled orders excluded", () => {
  const orders = [
    fact("1", "", 1, {
      status: "Pendente",
      situacaoNome: "COBRANÇA",
      dataEntregaPrevista: "2026-08-03",
      totalGeral: 100,
    }),
    fact("2", "", 1, {
      status: "Cancelado",
      situacaoNome: "COBRANÇA",
      dataEntregaPrevista: "2026-10-03",
      totalGeral: 500,
    }),
    fact("3", "", 1, {
      status: "Pendente",
      situacaoNome: "CUSTOS",
      dataEntregaPrevista: "2026-10-03",
      totalGeral: 500,
    }),
  ];
  const facts = [
    fact("1", "fFaturamento", 1, { totalGeral: 200 }),
    fact("1", "fFaturamento", 2, { totalGeral: 200, empresaId: 1 }),
    fact("2", "fDevolucoesOutros", 1, {
      totalGeral: 20,
      outrosDocumentosOperacaoId: 30,
    }),
    fact("3", "fDevolucoesOutros", 1, {
      totalGeral: 900,
      outrosDocumentosOperacaoId: 31,
    }),
  ];
  const t = sumRows(projection(facts, orders, "2026-10", "2026-10-26").rows);
  assert.equal(t.salesPending, 100);
  assert.equal(t.billed, 180);
  assert.equal(t.projection, 280);
  assert.equal(
    sumRows(projection(facts, orders, "2026-08", "2026-10-26").rows)
      .salesPending,
    0,
  );
});
