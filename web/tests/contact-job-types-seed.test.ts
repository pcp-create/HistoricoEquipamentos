import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { listJobTypes, selectedJobType } from "../lib/visits/job-types";
test("requested cargo list preserves IDs, names, users and flags; excluded and inactive are not selectable", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec(
      "CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,enabled boolean);INSERT INTO web_user_access VALUES('test',true);CREATE TABLE web_customer_contacts(id uuid,m8_id bigint,cargo_id int,job_title text,created_at timestamptz);",
    );
    await db.exec(readFileSync("sql/111_contact_job_types.sql", "utf8"));
    const sql = readFileSync("sql/112_contact_job_types_seed.sql", "utf8");
    await db.exec(sql);
    const first = (
      await db.query<any>("SELECT * FROM web_contact_job_types ORDER BY m8_id")
    ).rows;
    assert.equal(first.length, 39);
    assert.equal(first.filter((r) => r.name === "COMPRAS").length, 4);
    assert.equal(
      first.find((r) => r.m8_id === 33)?.name,
      "COORDENADOR DE UTILIDDADES",
    );
    assert.equal(first.find((r) => r.m8_id === 39)?.m8_user_id, 16);
    await db.exec(sql);
    assert.deepEqual(
      (await db.query<any>("SELECT * FROM web_contact_job_types ORDER BY m8_id"))
        .rows,
      first,
    );
    const query = db.query.bind(db);
    g.historyPool = { query };
    const all = await listJobTypes("test", true),
      active = await listJobTypes("test");
    assert.equal(all.length, 39);
    assert.equal(active.length, 36);
    assert.deepEqual(
      all
        .filter((r) => r.excluded)
        .map((r) => r.m8_id)
        .sort((a, b) => a - b),
      [20, 27],
    );
    for (const m8id of [20, 21, 27])
      await assert.rejects(
        () => selectedJobType({ query }, all.find((r) => r.m8_id === m8id)!.id),
        /cargo ativo/,
      );
    assert.deepEqual(
      active
        .filter((r) => r.name === "COMPRAS")
        .map((r) => r.m8_id)
        .sort((a, b) => a - b),
      [8, 30],
    );
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
