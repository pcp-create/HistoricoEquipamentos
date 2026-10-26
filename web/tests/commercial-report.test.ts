import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { refreshProjectionOrder } from "../lib/sales-projection/refresh-order";
import { commercialReturnPath } from "../lib/service-orders/return-path";
import { projection } from "../lib/sales-projection/model";

test("safe return keeps report filters without allowing external redirects", () => {
  assert.equal(
    commercialReturnPath("https://evil.test/comercial/vendas?x=1"),
    undefined,
  );
  assert.equal(
    commercialReturnPath("//evil.test/comercial/vendas?x=1"),
    undefined,
  );
  assert.equal(
    commercialReturnPath(
      "/comercial/vendas?period=2026-11&company=2&status=Pendente&other=secret",
    ),
    "/comercial/vendas?period=2026-11&company=2&status=Pendente",
  );
});
test("confirmed ERP refresh moves pending projection to new month; invalid reads leave it unchanged", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    previous = g.historyPool;
  try {
    const schema = readFileSync(
      new URL("../../supabase/migrations/001_m8_history.sql", import.meta.url),
      "utf8",
    )
      .split("CREATE TABLE public.m8_ordens_servico (")[1]
      .split("\n);")[0];
    await db.exec("CREATE TABLE m8_ordens_servico (" + schema + "\n);");
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const payload = {
      id: 10,
      empresaId: 1,
      status: "Pendente",
      situacaoNome: "COBRANÇA",
      totalGeral: 100,
      dataEntregaPrevista: "2026-10-30",
      dataAtualizacao: "2026-10-26T12:00:00Z",
      statusLancamentoNome: "Anterior",
      observacao: "Detalhe preservado",
    };
    await query(
      "INSERT INTO m8_ordens_servico(company_id,id_m8,payload,data_atualizacao) VALUES(1,10,$1,$2)",
      [JSON.stringify(payload), payload.dataAtualizacao],
    );
    const session = async () => async (path: string, body?: unknown) => {
      assert.equal(body, undefined);
      assert.match(path, /ordemservico\?Id=10/);
      return [
        {
          ...payload,
          dataEntregaPrevista: "2026-11-05",
          statusLancamentoNome: "Revisada",
          dataAtualizacao: "2026-10-26T13:00:00Z",
        },
      ];
    };
    await refreshProjectionOrder(1, "10", session);
    const orders = (
      await query<any>(
        "SELECT company_id,id_m8::text AS id,payload FROM m8_ordens_servico",
      )
    ).rows;
    assert.equal(orders[0].payload.statusLancamentoNome, "Revisada");
    assert.equal(
      projection([], orders, "2026-10", "2026-10-26").rows[0].salesPending,
      0,
    );
    assert.equal(
      projection([], orders, "2026-11", "2026-10-26").rows[0].salesPending,
      100,
    );
    await assert.rejects(() =>
      refreshProjectionOrder(1, "10", async () => async () => [{ id: 99 }]),
    );
    assert.equal(
      (await query<any>("SELECT payload FROM m8_ordens_servico")).rows[0]
        .payload.dataEntregaPrevista,
      "2026-11-05",
    );
  } finally {
    g.historyPool = previous;
    await db.close();
  }
});
test("contracts show installment, validity and matched invoicing; sales retain PBIX detail fields", () => {
  const result = projection(
    [
      {
        company_id: 1,
        id: "20",
        kind: "fContratos",
        payload: {
          estabelecimentoId: 1,
          pessoaId: 4,
          pessoaNome: "Cliente",
          tipoContratoNome: "Locação",
          inicio: "2026-01-01",
          final: "2026-12-31",
          valor: 1200,
        },
      },
      {
        company_id: 1,
        id: "30",
        kind: "fFaturamento",
        payload: {
          empresaId: 1,
          pessoaId: 4,
          status: "Processado",
          emissao: "2026-10-10",
          totalGeral: 100,
        },
      },
    ],
    [
      {
        company_id: 1,
        id: "40",
        payload: {
          empresaId: 1,
          status: "Pendente",
          situacaoNome: "COBRANÇA",
          totalGeral: 50,
          dataEntregaPrevista: "2026-10-31",
          observacao: "Obs longa",
          equipamento: "Compressor",
          tipoNome: "Manutenção",
          modalidadeAtendimentoId: 5,
        },
      },
    ],
    "2026-10",
    "2026-10-26",
  );
  assert.deepEqual(result.details.find((d) => d.kind === "contracts")?.fields, {
    contractType: "Locação",
    installment: "10/12",
    start: "2026-01-01",
    end: "2026-12-31",
    billed: 100,
    pending: 0,
  });
  const sale = result.details.find((d) => d.kind === "salesPending")!;
  assert.equal(sale.fields?.notes, "Obs longa");
  assert.equal(sale.fields?.equipment, "Compressor");
  assert.equal(sale.fields?.modality, "Interno (Oficina)");
});

test("return to sales preserves the partial billing filter", () => {
  assert.equal(
    commercialReturnPath(
      "/comercial/vendas?period=2026-10&company=1&billing=partial",
    ),
    "/comercial/vendas?period=2026-10&company=1&status=all&billing=partial",
  );
});
