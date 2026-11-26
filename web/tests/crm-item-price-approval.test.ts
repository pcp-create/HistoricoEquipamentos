import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  approveProposalItem,
  itemApprovals,
  reviewItemPrices,
} from "../lib/crm/item-price-approval";
import { emptyDraft } from "../lib/crm/model";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  op = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("individual approvals enforce role, saved version, review state and precise item values", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    previous = g.historyPool;
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
   CREATE TABLE web_user_access(email text PRIMARY KEY,enabled boolean,role text,display_name text,job_titles jsonb);
   INSERT INTO web_user_access VALUES('manager',true,'user','Gestor Teste','["Coordenador"]'),('sales',true,'user','Vendedor','["Comercial"]');
   CREATE TABLE crm_opportunities(id uuid PRIMARY KEY,lead_id uuid,status text);
   CREATE TABLE crm_proposals(id uuid PRIMARY KEY,opportunity_id uuid,version integer,document jsonb,status text,updated_by text,updated_at timestamptz);
   CREATE TABLE crm_proposal_workflows(proposal_id uuid PRIMARY KEY,state text);
   CREATE TABLE crm_events(opportunity_id uuid,proposal_id uuid,actor text,action text,details jsonb);
   CREATE TABLE crm_price_restorations(product_id bigint,state text,approval_id bigint NOT NULL);`);
    await db.exec(
      readFileSync(
        new URL("../sql/130_crm_item_price_approvals.sql", import.meta.url),
        "utf8",
      ),
    );
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const draft = {
      ...emptyDraft(),
      company: "1",
      customer: "10",
      items: [
        {
          kind: "material" as const,
          code: "50",
          name: "Filtro",
          quantity: "2",
          price: "400",
          discountPercent: "10",
        },
        {
          kind: "material" as const,
          code: "51",
          name: "Óleo",
          quantity: "1",
          price: "100",
        },
      ],
    };
    await query("INSERT INTO crm_opportunities VALUES($1,NULL,$2)", [
      op,
      "open",
    ]);
    await query("INSERT INTO crm_proposals VALUES($1,$2,1,$3,$4,NULL,NULL)", [
      id,
      op,
      JSON.stringify(draft),
      "pending",
    ]);
    await query("INSERT INTO crm_proposal_workflows VALUES($1,$2)", [
      id,
      "in_review",
    ]);
    let minimum = 500;
    const session: any = async () => async () => [
      { id: 50, precoVendaMinimo: minimum },
      { id: 51, precoVendaMinimo: 120 },
    ];
    const input = { id, version: 1, code: "50" };
    await assert.rejects(
      approveProposalItem(input, "sales", session),
      /Somente/,
    );
    await assert.rejects(
      approveProposalItem({ ...input, version: 9 }, "manager", session),
      /alterada/,
    );
    await query("UPDATE crm_proposals SET status='won'");
    await assert.rejects(approveProposalItem(input,"manager",session),/disponível/);
    await query("UPDATE crm_proposals SET status='pending'");
    await query("UPDATE crm_proposal_workflows SET state='creating'");
    const result = await approveProposalItem(input, "manager", session);
    assert.equal(result.version, 2);
    const approvals = await itemApprovals(g.historyPool, id, draft);
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].approved_name, "Gestor Teste");
    assert.ok(approvals[0].approved_at);
    let review = await reviewItemPrices(g.historyPool, id, draft, "", session);
    assert.equal(review.approved, false);
    assert.deepEqual(
      review.items.map((i) => [i.code, i.approved]),
      [
        ["50", true],
        ["51", false],
      ],
    );
    await query("UPDATE crm_proposal_workflows SET state='reviewed'");
    await approveProposalItem(
      { id, version: 2, code: "51" },
      "manager",
      session,
    );
    assert.equal(
      (await reviewItemPrices(g.historyPool, id, draft, "", session)).approved,
      true,
    );
    const changed = {
      ...draft,
      items: [{ ...draft.items[0], price: "399" }, draft.items[1]],
    };
    assert.equal((await itemApprovals(g.historyPool, id, changed)).length, 1);
    assert.equal(
      (await itemApprovals(g.historyPool, id, { ...draft, customer: "11" }))
        .length,
      0,
    );
    assert.equal(
      (
        await itemApprovals(g.historyPool, id, {
          ...draft,
          items: [{ ...draft.items[0], quantity: "3" }, draft.items[1]],
        })
      ).length,
      1,
    );
    minimum = 510;
    assert.equal(
      (await reviewItemPrices(g.historyPool, id, draft, "", session)).approved,
      false,
    );
    await query(
      "UPDATE web_user_access SET enabled=false WHERE email='manager'",
    );
    assert.equal((await itemApprovals(g.historyPool, id, draft)).length, 0);
    assert.equal(
      (await query<any>("SELECT count(*) n FROM crm_events")).rows[0].n,
      2,
    );
  } finally {
    g.historyPool = previous;
    await db.close();
  }
});
