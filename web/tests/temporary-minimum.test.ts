import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withTemporaryMinimum,
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
    assert.equal(minimum, 465);
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
    setApproved: (v: boolean) => (approved = v),
    setRestoreFails: (v: boolean) => (restoreFails = v),
    setExternalChange: () => (externalChange = true),
    get: () => ({ minimum, record, writes }),
  };
}
test("approved product restores original minimum and records the confirmed item", async () => {
  const f = fixture();
  assert.deepEqual(await withTemporaryMinimum(f.row, f.call, f.write, f.db), {
    id: 123,
  });
  assert.equal(f.get().minimum, 510);
  assert.equal(f.get().record.state, "restored");
  assert.deepEqual(f.get().record.item_result, { id: 123 });
  assert.deepEqual(await withTemporaryMinimum(f.row, f.call, f.write, f.db), {
    id: 123,
  });
  assert.equal(f.get().writes, 1);
});
test("no approval means no product or catalogue write", async () => {
  const f = fixture();
  f.setApproved(false);
  await assert.rejects(
    withTemporaryMinimum(f.row, f.call, f.write, f.db),
    /revisão/,
  );
  assert.equal(f.get().minimum, 510);
  assert.equal(f.get().writes, 0);
  assert.equal(f.get().record, null);
});
test("uncertain item response still restores minimum without retrying the item", async () => {
  const f = fixture();
  await assert.rejects(
    withTemporaryMinimum(
      f.row,
      f.call,
      async () => {
        throw new M8RequestError("timeout", true);
      },
      f.db,
    ),
    /timeout/,
  );
  assert.equal(f.get().minimum, 510);
  assert.equal(f.get().record.state, "restored");
});
test("restoration failure persists the journal and blocks a second item write", async () => {
  const f = fixture();
  f.setRestoreFails(true);
  await assert.rejects(
    withTemporaryMinimum(f.row, f.call, f.write, f.db),
    /Restauração/,
  );
  assert.equal(f.get().record.state, "pending");
  assert.equal(f.get().writes, 1);
  await assert.rejects(
    withTemporaryMinimum(f.row, f.call, f.write, f.db),
    /pendente/,
  );
  assert.equal(f.get().writes, 1);
});
test("an external price change is not overwritten", async () => {
  const f = fixture();
  f.setExternalChange();
  await assert.rejects(
    withTemporaryMinimum(f.row, f.call, f.write, f.db),
    /Restauração/,
  );
  assert.equal(f.get().minimum, 600);
  assert.equal(f.get().record.state, "pending");
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

test("ambiguous lowering remains quarantined even if the read still shows the original minimum", async () => {
  const f = fixture();
  const call = async (path: string, body?: any) => {
    if (body) throw new M8RequestError("timeout", true);
    return f.call(path);
  };
  await assert.rejects(
    withTemporaryMinimum(f.row, call, f.write, f.db),
    /Restauração/,
  );
  assert.equal(f.get().record.state, "pending");
  assert.equal(f.get().writes, 0);
});
test("administrator recovers a pending restoration without resending a confirmed item", async () => {
  const f = fixture();
  f.setRestoreFails(true);
  await assert.rejects(withTemporaryMinimum(f.row, f.call, f.write, f.db));
  f.setRestoreFails(false);
  await restorePendingMinimum(1, "admin", f.db, async () => f.call);
  assert.equal(f.get().minimum, 510);
  assert.equal(f.get().record.state, "restored");
  assert.equal(f.get().writes, 1);
  assert.deepEqual(await withTemporaryMinimum(f.row, f.call, f.write, f.db), {
    id: 123,
  });
  assert.equal(f.get().writes, 1);
});
