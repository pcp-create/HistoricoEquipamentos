import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withApprovedItemPrice,
  restorePendingMinimum,
} from "../lib/crm/temporary-minimum";
import { M8RequestError } from "../lib/service-orders/m8";
const priceFingerprint=(draft:any)=>itemPriceKey(draft,draft.items[0]);
import {itemPriceKey} from "../lib/crm/item-price-key";
import { priceManager } from "../lib/crm/price-manager";
function fixture() {
  let minimum = 510,
    record: any = null,
    writes = 0,
    approved = true,
    restoreFails = false,
    externalChange = false;
  const draft = {
    company: "1",
    customer: "2",
    type: "9",
    items: [
      { kind: "material", code: "11958", quantity: "1", price: "465.00" },
    ],
  };
  const query = async (sql: string, values: any[] = []) => {
    if (["BEGIN READ WRITE", "COMMIT", "ROLLBACK"].includes(sql))
      return { rows: [] };
    if (sql.includes("FROM web_user_access"))
      return { rows: [{ enabled: true, role: "admin" }] };
    if (sql.includes("FROM crm_order_links"))
      return { rows: [{ proposal_id: "proposal", document: draft }] };
    if (sql.includes("pg_try_advisory_xact_lock"))
      return { rows: [{ locked: true }] };
    if (sql.includes("pg_advisory_unlock")) return { rows: [] };
    if (sql.startsWith("SELECT item_result"))
      return {
        rows:
          record?.state === "restored" && record.item_result ? [record] : [],
      };
    if (sql.includes("FROM crm_price_restorations"))
      return { rows: record && record.state !== "restored" ? [record] : [] };
    if (sql.includes("FROM crm_item_price_approvals"))
      return {
        rows: approved
          ? [
              {
                id:1,item_key:itemPriceKey(draft as any,draft.items[0] as any),minimum_price:510,
                enabled: true,
                role: "manager",
                document:draft.items[0],
              },
            ]
          : [],
      };
    if (sql.startsWith("INSERT INTO crm_price_restorations")) {
      record = {
        id: 1,
        state: "pending",
        product_id: 11958,
        company_id: 1,
        original_price: values[3],
        temporary_price: values[4],
      };
      return { rows: [record] };
    }
    if (sql.includes("SET item_result"))
      record.item_result = JSON.parse(values[1]);
    else if (sql.includes("SET state='restored'")) record.state = "restored";
    else if (sql.includes("SET error")) record.error = values[1];
    else throw Error("Unexpected SQL " + sql);
    return { rows: [] };
  };
  const db = { query, connect: async () => ({ query, release() {} }) };
  const call = async (path: string, body?: any) => {
    if (body) {
      assert.ok(record);
      if (body.precoVendaMinimo === 510 && restoreFails) throw Error("offline");
      minimum = body.precoVendaMinimo;
      return { id: 11958 };
    }
    return [{ id: 11958, precoVendaMinimo: minimum }];
  };
  const row = {
    id: "submission",
    company_id: 1,
    m8_id: 15564,
    next_item: 0,
    items: [
      { kind: "material", payload: { produtoId: 11958, valorUnitario: 465 } },
    ],
  };
  const write = async () => {
    assert.equal(minimum, 510);
    writes++;
    if (externalChange) minimum = 600;
    return { id: 123 };
  };
  return {
    db,
    call,
    row,
    write,
    draft,
    seedLegacy: () => {minimum=465;record={id:1,state:'pending',product_id:11958,company_id:1,original_price:510,temporary_price:465,item_result:{id:123}};},
    setApproved: (v: boolean) => (approved = v),
    setRestoreFails: (v: boolean) => (restoreFails = v),
    setExternalChange: () => (externalChange = true),
    get: () => ({ minimum, record, writes }),
  };
}
test("approved product is sent without changing the catalogue minimum", async () => {
 const f=fixture();
 assert.deepEqual(await withApprovedItemPrice(f.row,f.call,f.write,f.db),{id:123});
 assert.equal(f.get().minimum,510);assert.equal(f.get().record,null);assert.equal(f.get().writes,1);
});
test("unapproved product cannot reach the ERP",async()=>{
 const f=fixture();f.setApproved(false);
 await assert.rejects(withApprovedItemPrice(f.row,f.call,f.write,f.db),/Aprove/);
 assert.equal(f.get().writes,0);assert.equal(f.get().record,null);
});
test("changed payload price invalidates approval",async()=>{
 const f=fixture();f.row.items[0].payload.valorUnitario=460;
 await assert.rejects(withApprovedItemPrice(f.row,f.call,f.write,f.db),/Aprove/);
 assert.equal(f.get().writes,0);
});
test("increased minimum requires a new approval",async()=>{
 const f=fixture();
 await assert.rejects(withApprovedItemPrice(f.row,async()=>[{id:11958,precoVendaMinimo:600}],f.write,f.db),/Aprove/);
 assert.equal(f.get().writes,0);
});

test("approval is scoped to company, quantities and net prices", () => {
  const f = fixture(),
    hash = priceFingerprint(f.draft);
  assert.notEqual(hash, priceFingerprint({ ...f.draft, company: "2" }));
  assert.notEqual(
    hash,
    priceFingerprint({
      ...f.draft,
      items: [{ ...f.draft.items[0], quantity: "2" }],
    }),
  );
  assert.notEqual(
    hash,
    priceFingerprint({
      ...f.draft,
      items: [{ ...f.draft.items[0], discountPercent: "10" }],
    }),
  );
  assert.equal(
    priceManager({ enabled: true, role: "user", job_titles: ["Diretora"] }),
    true,
  );
  assert.equal(priceManager({ enabled: false, role: "admin" }), false);
  assert.equal(
    priceManager({ enabled: true, role: "user", job_title: "Vendedor" }),
    false,
  );
});


test("legacy pending restoration can be recovered without adding an item",async()=>{
 const f=fixture();f.seedLegacy();
 await assert.rejects(withApprovedItemPrice(f.row,f.call,f.write,f.db),/restauração/);
 await restorePendingMinimum(1,'admin',f.db,async()=>f.call);
 assert.equal(f.get().minimum,510);assert.equal(f.get().record.state,'restored');
 assert.deepEqual(await withApprovedItemPrice(f.row,f.call,f.write,f.db),{id:123});
 assert.equal(f.get().writes,0);
});
