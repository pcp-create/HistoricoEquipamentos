import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDraft, proposalDraft } from "../lib/crm/model";
import { currentTaxes, deliveryTerm } from "../lib/crm/product-terms";
import { hydrateProductTaxes } from "../lib/crm/product-taxes";
import type { OrderItem } from "../lib/service-orders/model";
const item: OrderItem = {
  kind: "material",
  code: "50",
  name: "Filtro",
  quantity: "2",
  price: "100",
  discountPercent: "10",
  availableStock: 2,
};
const draft = () => ({
  ...emptyDraft(),
  company: "1",
  customer: "42",
  commercial: { taxBudgetType: "1", deliveryDays: "15" },
  items: [{ ...item }],
});
test("delivery uses available stock, aggregate demand, missing stock and seller overrides", () => {
  const d = draft();
  assert.equal(deliveryTerm(d, d.items[0]), "Imediato");
  assert.equal(
    deliveryTerm(d, { ...item, availableStock: 1 }),
    "15 dias úteis",
  );
  assert.equal(
    deliveryTerm(d, { ...item, availableStock: null }),
    "15 dias úteis",
  );
  assert.equal(
    deliveryTerm(d, { ...item, deliveryLeadTime: "5 dias úteis" }),
    "5 dias úteis",
  );
  assert.equal(
    deliveryTerm({ ...d, items: [item, item] }, item),
    "15 dias úteis",
  );
  assert.equal(
    deliveryTerm({ ...d, commercial: {} }, { ...item, availableStock: null }),
    "Prazo não informado",
  );
  const parsed = proposalDraft({
    ...d,
    items: [
      { ...item, deliveryLeadTime: "7 dias úteis", taxes: { ipi: 999999 } },
    ],
  });
  assert.equal(parsed.commercial?.deliveryDays, "15");
  assert.equal(parsed.items[0].deliveryLeadTime, "7 dias úteis");
  assert.equal(parsed.items[0].taxes, undefined);
  assert.equal(parsed.items[0].availableStock, undefined);
  assert.throws(() =>
    proposalDraft({ ...d, commercial: { deliveryDays: "-1" } }),
  );
});
test("tax simulation uses company/customer/fiscal type/net prices and invalidates changed inputs", async () => {
  let count = 0;
  const d = await hydrateProductTaxes(draft(), async (company) => {
    assert.equal(company, 1);
    return async (path, body) => {
      count++;
      assert.equal(path, "/v1/crm/impostosimular");
      assert.deepEqual(body, {
        clienteId: 42,
        tipoOrcamentoId: 1,
        itens: [{ produtoId: 50, quantidade: 2, valorUnitario: 90 }],
      });
      return [
        {
          produtoId: 50,
          impostos: {
            valorIcms: 32.4,
            valorIcmsSt: 0,
            valorPis: 2.97,
            valorCofins: 13.68,
            valorIpi: 9,
          },
        },
      ];
    };
  });
  assert.equal(count, 1);
  assert.equal(currentTaxes(d, d.items[0])?.icms, 3240);
  assert.equal(currentTaxes(d, d.items[0])?.ipi, 900);
  for (const patch of [
    { quantity: "3" },
    { price: "101" },
    { discountPercent: "0" },
  ])
    assert.equal(currentTaxes(d, { ...d.items[0], ...patch }), undefined);
  assert.equal(currentTaxes({ ...d, customer: "43" }, d.items[0]), undefined);
  assert.equal(currentTaxes({ ...d, company: "2" }, d.items[0]), undefined);
  assert.equal(
    currentTaxes({ ...d, commercial: { taxBudgetType: "2" } }, d.items[0]),
    undefined,
  );
});
test("duplicate product lines are calculated separately and missing taxes never become zero", async () => {
  const d = draft();
  d.items.push({ ...item, price: "200" });
  let calls = 0;
  const out = await hydrateProductTaxes(
    d,
    async () => async (_path, body: any) => {
      calls++;
      return [
        {
          produtoId: 50,
          impostos: {
            valorIcms: body.itens[0].valorUnitario,
            valorIcmsSt: 0,
            valorPis: 0,
            valorCofins: 0,
            valorIpi: 0,
          },
        },
      ];
    },
  );
  assert.equal(calls, 2);
  assert.equal(out.items[0].taxes?.icms, 9000);
  assert.equal(out.items[1].taxes?.icms, 18000);
  await assert.rejects(
    () => hydrateProductTaxes(draft(), async () => async () => []),
    /Não foi possível simular/,
  );
  await assert.rejects(
    () =>
      hydrateProductTaxes(draft(), async () => async () => [
        { produtoId: 50, impostos: { valorIcms: null } },
      ]),
    /Não foi possível simular/,
  );
});

test('PDF requires fiscal setup for products and services',async()=>{
 const {hydratePdfProductTaxes}=await import('../lib/crm/product-taxes');
 let calls=0;const session=async()=>{calls++;return async()=>[];};
 await assert.rejects(()=>hydratePdfProductTaxes({...draft(),commercial:{}},session),/Configure o tipo de orçamento fiscal/);
 assert.equal(calls,0);
 const services={...draft(),commercial:{},items:[{...item,kind:'service' as const}]};
 await assert.rejects(()=>hydratePdfProductTaxes(services,session),/Configure o tipo de orçamento fiscal/);
 assert.equal(calls,0);
});

test('service taxes use code 11869 for each line, excluding product-only taxes',async()=>{
 const services={...draft(),items:[{...item,kind:'service' as const,code:'77',price:'100'},{...item,kind:'service' as const,code:'78',price:'200'}, {...item,code:'11869'}]};
 const calls:any[]=[];
 const result=await hydrateProductTaxes(services,async()=>async(_path,body:any)=>{
  calls.push(body);
  return body.itens.map((line:any)=>({produtoId:line.produtoId,impostos:{valorIcms:17,valorIcmsSt:4,valorIpi:2,valorPis:line.valorUnitario*.01,valorCofins:line.valorUnitario*.05}}));
 });
 assert.equal(calls.length,3);
 assert.ok(calls.every(call=>call.itens[0].produtoId===11869));
 assert.deepEqual(result.items.slice(0,2).map(i=>[i.taxes?.pis,i.taxes?.cofins,i.taxes?.icms,i.taxes?.ipi]),[[90,450,null,null],[180,900,null,null]]);
 assert.equal(result.items[2].taxes?.icms,1700);
 assert.notEqual(result.items[0].taxes?.key,result.items[2].taxes?.key);
 await assert.rejects(()=>hydrateProductTaxes({...services,items:[services.items[0]]},async()=>async()=>[{produtoId:11869,impostos:{valorPis:null,valorCofins:0}}]),/Não foi possível simular/);
});
