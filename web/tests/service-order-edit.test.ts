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
  deliveryHistory,
  resolveEditEquipment,
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
        if(path.includes('/configuracoes/vendedor?'))return [{id:20,razaoSocial:'Vendedor atual',ativo:true},{id:21,razaoSocial:'Outro vendedor',ativo:true}];
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
    await db.exec('CREATE TABLE m8_order_type_catalog(id bigint,equipment_required boolean);INSERT INTO m8_order_type_catalog VALUES(1,true);');
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    assert.equal(processedOrder("Processada"), true);
    assert.equal(processedOrder("Processado"), true);
    const draft = toEditDraft(source, "2");
    const legacyEquipment = await resolveEditEquipment({equipamentoProduto:{equipamentoId:2383}}, "2", "800", (async()=>async()=>[{id:800,produtoEquipamentoId:23434,equipamento:"2383 - Compressor R160N"}]) as any);
    assert.equal(legacyEquipment.id,"23434");
    assert.equal(legacyEquipment.name,"2383 - Compressor R160N");
    await assert.rejects(resolveEditEquipment({equipamentoProduto:{equipamentoId:2383}},"2","800",(async()=>async()=>[{id:801,produtoEquipamentoId:23434}]) as any), /equipamento atual/);

    assert.equal(draft.technician, "m8:99");
    assert.equal(draft.items[0].id, "101");
    await assert.rejects(prepareEdit('user',randomUUID(),'2','800',fingerprint(source),{...draft,equipment:''},session),/exige equipamento/);
    await db.exec('UPDATE m8_order_type_catalog SET equipment_required=false WHERE id=1');
    const optionalEdit=randomUUID();await prepareEdit('user',optionalEdit,'2','800',fingerprint(source),{...draft,equipment:''},session);
    assert.equal((await db.query<any>('SELECT steps FROM service_order_edits WHERE id=$1',[optionalEdit])).rows[0].steps[0].payload.equipamentoProduto,null);
    await db.query('DELETE FROM service_order_edits WHERE id=$1',[optionalEdit]);
    await db.exec('UPDATE m8_order_type_catalog SET equipment_required=true WHERE id=1');
    const sellerDraft={...draft,seller:'21'},manualSellerEdit=randomUUID();
    await prepareEdit('manual-seller-user',manualSellerEdit,'2','800',fingerprint(source),sellerDraft,session);
    await db.query('DELETE FROM service_order_edits WHERE id=$1',[manualSellerEdit]);
    const dateEditId = randomUUID();
    const rescheduled = { ...draft, expected: "2026-11-10" };
    await assert.rejects(() => prepareEdit("user", dateEditId, "2", "800", fingerprint(source), rescheduled, session), /justificativa/);
    await assert.rejects(() => prepareEdit("user", dateEditId, "2", "800", fingerprint(source), {...rescheduled, deliveryChangeReason: "   "}, session), /justificativa/);
    await prepareEdit("user", dateEditId, "2", "800", fingerprint(source), {...rescheduled, deliveryChangeReason: "  Aguardando peça do fornecedor  "}, session);
    const dateHistory = await deliveryHistory("2", "800");
    assert.equal(dateHistory.length, 1);
    assert.deepEqual(dateHistory[0].change, { before: draft.expected, after: "2026-11-10", reason: "Aguardando peça do fornecedor" });
    assert.equal(dateHistory[0].created_by, "user");
    assert.equal(dateHistory[0].state, "ready");
    assert.equal((await deliveryHistory("1", "800")).length, 0);
    const dateSubmission = (await db.query<any>("SELECT steps FROM service_order_edits WHERE id=$1", [dateEditId])).rows[0];
    assert.equal(dateSubmission.steps[0].payload.deliveryChangeReason, undefined);
    await db.query("DELETE FROM service_order_edits WHERE id=$1", [dateEditId]);

    const id = randomUUID(),
      changed = { ...draft, notes: "Revisada" };
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
    assert.equal(writes[0].body.produtos,undefined);
    assert.equal(writes[0].body.servicos,undefined);
    assert.equal(writes[0].body.observacao,"Revisada");
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
    for(const patch of [{quantity:'9'},{price:'999'},{notes:'Modificada'}]){
      const index='notes' in patch?1:0;
      await assert.rejects(prepareEdit('user',randomUUID(),'2','800',fingerprint(source),{...draft,items:draft.items.map((item,i)=>i===index?{...item,...patch}:item)},session),/somente para consulta/);
    }
    await db.exec('CREATE TABLE m8_product_catalog(product_id bigint);CREATE TABLE m8_service_catalog(service_id bigint);INSERT INTO m8_product_catalog VALUES(51);INSERT INTO m8_service_catalog VALUES(61);');
    const inclusion=randomUUID(),beforeInclusion=writes.length;
    await prepareEdit('user',inclusion,'2','800',fingerprint(source),{...draft,items:[...draft.items,{kind:'material',code:'51',name:'Novo produto',quantity:'2',price:'5'},{kind:'service',code:'61',name:'Novo serviço',quantity:'1',price:'20',notes:'Nova observação'}]},session);
    assert.equal((await advanceEdit('user',inclusion,session)).state,'ready');
    assert.equal((await advanceEdit('user',inclusion,session)).state,'ready');
    assert.equal((await advanceEdit('user',inclusion,session)).state,'complete');
    const added=writes.slice(beforeInclusion);
    assert.deepEqual(added.map(w=>[w.method,w.path]),[['PUT','/v1/assistenciatecnica/ordemservico/800'],['POST','/v1/assistenciatecnica/ordemservico/800/produto'],['POST','/v1/assistenciatecnica/ordemservico/800/servico']]);
    assert.equal(added[0].body.produtos,undefined);assert.equal(added[0].body.servicos,undefined);
    assert.equal(added[1].body.produtoId,51);assert.equal(added[2].body.servicoId,61);assert.equal(added[2].body.observacao,'Nova observação');
    const missingItemId=randomUUID();
    await prepareEdit('user',missingItemId,'2','800',fingerprint(source),{...draft,items:[...draft.items,{kind:'material',code:'51',name:'Novo',quantity:'1',price:'5'}]},session);
    await advanceEdit('user',missingItemId,session);
    const missingReply=async(company:number)=>{const client=await session(company);return async(path:string,body?:any,method?:string)=>{const result=await client(path,body,method);return method==='POST'?{}:result;};};
    assert.equal((await advanceEdit('user',missingItemId,missingReply)).state,'uncertain');
    const afterUncertainItem=writes.length;await advanceEdit('user',missingItemId,missingReply);assert.equal(writes.length,afterUncertainItem);
    await db.query('DELETE FROM service_order_edits WHERE id=$1',[missingItemId]);
    const legacy=randomUUID();await prepareEdit('user',legacy,'2','800',fingerprint(source),draft,session);
    await db.query("UPDATE service_order_edits SET steps=jsonb_set(steps,'{0,payload,produtos}','[]'::jsonb) WHERE id=$1",[legacy]);
    const beforeLegacy=writes.length;
    assert.equal((await advanceEdit('user',legacy,session)).state,'rejected');assert.equal(writes.length,beforeLegacy);
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
