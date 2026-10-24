import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  prepareEdit,
  advanceEdit,
  readEditSource,
  toEditDraft,
  fingerprint,
} from "../lib/service-orders/edit";
import { M8RequestError } from "../lib/service-orders/m8";
import { processedOrder } from "../lib/service-orders/edit-status";
test("edit preserves IDs and hidden fields, blocks processed/stale orders and never repeats uncertain writes", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    previous = g.historyPool;
  const source: any = {
    id: 800,
    status: "Pendente",
    numeroSequencia: 15099,
    emissao: "2026-10-01T13:00:00",
    dataEntrega: "2026-10-23T13:00:00",
    dataEntregaPrevista: "2026-10-22T13:00:00",
    tipoId: 1,
    clienteId: 10,
    funcionarioId: 20,
    condicaoPagamentoId: 1,
    observacao: "Original",
    responsavelTecnicoId: 99,
    contato: "Contato preservado",
    produtos: [
      {
        id: 101,
        produtoId: 50,
        produtoNome: "Filtro",
        quantidade: 2,
        valorUnitario: 10,
        valorTotal: 18,
        percentualDesconto: 10,
        observacao: "Não perder",
      },
    ],
    servicos: [
      {
        id: 201,
        servicoId: 60,
        servicoNome: "Serviço",
        observacao: "Nota existente",
        observacaoInterna: "Interna existente",
        quantidade: 1,
        valorUnitario: 20,
        valorTotal: 20,
      },
    ],
    equipamentoProduto: {
      id: 300,
      equipamentoProdutoId: 100,
      numeroSerie: "ABC",
      horimetro: "1000",
    },
    statusLancamentoId: 1,
  };
  let current = structuredClone(source),
    writes: any[] = [];
  const session = async (company: number) => {
    assert.equal(company, 2);
    return async (path: string, body?: any, method?: string) => {
      if (body === undefined) {
        assert.ok(path.includes("Id=800"));
        return [structuredClone(current)];
      }
      writes.push({ path, body, method });
      return { id: 800 };
    };
  };
  try {
    await db.exec(
      "CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,m8_employee_id int,enabled boolean);CREATE TABLE service_order_registries(kind text,id int,active boolean,warranty_id int);INSERT INTO service_order_registries VALUES('flow-statuses',2,true,null);",
    );
    await db.exec(
      readFileSync(
        new URL("../sql/066_service_order_edits.sql", import.meta.url),
        "utf8",
      ),
    );
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    assert.equal(processedOrder("Processada"), true);
    assert.equal(processedOrder("Processado"), true);
    const draft = toEditDraft(source, "2");
    assert.equal(draft.technician, "m8:99");
    assert.equal(draft.items[0].id, "101");
    const id = randomUUID(),
      changed = { ...draft, notes: "Revisada", items: draft.items.map(i => i.kind === "service" ? {...i, notes: "Nota revisada", internalNotes: ""} : i) };
    assert.equal(draft.items[1].notes, "Nota existente");
    assert.equal(draft.items[1].internalNotes, "Interna existente");
    await prepareEdit(
      "user",
      id,
      "2",
      "800",
      fingerprint(source),
      changed,
      session,
    );
    await assert.rejects(() =>
      prepareEdit(
        "other",
        id,
        "2",
        "800",
        fingerprint(source),
        changed,
        session,
      ),
    );
    await assert.rejects(() => advanceEdit("other", id, session));
    assert.equal((await advanceEdit("user", id, session)).state, "complete");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, "PUT");
    assert.equal(writes[0].path, "/v1/assistenciatecnica/ordemservico/800");
    assert.equal(writes[0].body.produtos[0].id, 101);
    assert.equal(writes[0].body.produtos[0].percentualDesconto, 10);
    assert.equal(writes[0].body.produtos[0].valorTotal, 18);
    assert.equal(writes[0].body.produtos[0].observacao, "Não perder");
    assert.equal(writes[0].body.observacao, "Revisada");
    assert.equal(writes[0].body.servicos[0].observacao, "Nota revisada");
    assert.equal(writes[0].body.servicos[0].observacaoInterna, "");
    assert.equal(writes[0].body.responsavelTecnicoId, 99);
    assert.equal(writes[0].body.emissao, source.emissao);
    assert.equal(writes[0].body.equipamentoProduto.horimetro, "1000");
    assert.equal(writes[0].body.contato, "Contato preservado");
    assert.ok(!("observacaoInterna" in writes[0].body));
    await advanceEdit("user", id, session);
    assert.equal(writes.length, 1);
    current.status = "Processado";
    await assert.rejects(
      () => readEditSource("2", "800", session),
      /processadas/,
    );
    await assert.rejects(
      () =>
        prepareEdit(
          "user",
          randomUUID(),
          "2",
          "800",
          fingerprint(source),
          draft,
          session,
        ),
      /processadas/,
    );
    current = structuredClone(source);
    current.observacao = "Mudou";
    await assert.rejects(
      () =>
        prepareEdit(
          "user",
          randomUUID(),
          "2",
          "800",
          fingerprint(source),
          draft,
          session,
        ),
      /alterada/,
    );
    current = structuredClone(source);
    const race = randomUUID();
    await prepareEdit(
      "user",
      race,
      "2",
      "800",
      fingerprint(source),
      draft,
      session,
    );
    current.status = "Processado";
    assert.equal((await advanceEdit("user", race, session)).state, "rejected");
    assert.equal(writes.length, 1);
    current = structuredClone(source);
    const removal = randomUUID(),
      removeDraft = {
        ...draft,
        items: draft.items.filter((i) => i.kind !== "material"),
        flowStatus: "2",
      };
    await prepareEdit(
      "user",
      removal,
      "2",
      "800",
      fingerprint(source),
      removeDraft,
      session,
    );
    assert.equal((await advanceEdit("user", removal, session)).state, "ready");
    assert.equal((await advanceEdit("user", removal, session)).state, "ready");
    assert.equal(writes.at(-1).method, "DELETE");
    assert.ok(writes.at(-1).path.endsWith("/produto/101"));
    assert.equal(
      (await advanceEdit("user", removal, session)).state,
      "complete",
    );
    assert.equal(writes.at(-1).method, "PATCH");
    assert.deepEqual(writes.at(-1).body, { statusFluxoId: 2 });
    const uncertain = randomUUID();
    await prepareEdit(
      "user",
      uncertain,
      "2",
      "800",
      fingerprint(source),
      draft,
      session,
    );
    let calls = 0;
    const timeout = async () => async (_p: string, body?: any) => {
      if (body === undefined) return [source];
      calls++;
      throw new M8RequestError("timeout", true);
    };
    assert.equal(
      (await advanceEdit("user", uncertain, timeout)).state,
      "uncertain",
    );
    await advanceEdit("user", uncertain, timeout);
    assert.equal(calls, 1);
    await assert.rejects(
      () =>
        prepareEdit(
          "user",
          randomUUID(),
          "2",
          "800",
          fingerprint(source),
          draft,
          session,
        ),
      /andamento/,
    );
  } finally {
    g.historyPool = previous;
    await db.close();
  }
});
