import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import {
  snapshotDelete,
  SnapshotInputError,
} from "../lib/sales-projection/snapshots";
test("deletion scopes the period and preserves unrelated partials", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    previous = g.historyPool;
  const id = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await db.exec(readFileSync("../supabase/migrations/020_sales_projection_snapshots.sql", "utf8"));
    await db.query(
      "INSERT INTO web_sales_projection_snapshots(id,period,label,created_by,document) VALUES ($1, '2026-10', 'Teste', 'admin', '{}'), ('00000000-0000-4000-8000-000000000002', '2026-10', 'Outra', 'admin', '{}')",
      [id],
    );
    await assert.rejects(db.query("DELETE FROM web_sales_projection_snapshots WHERE id=$1", [id]), /imutáveis/);
    await db.exec(readFileSync("../supabase/migrations/023_projection_snapshot_admin_delete.sql", "utf8"));
    await assert.rejects(db.query("UPDATE web_sales_projection_snapshots SET label='Alterada' WHERE id=$1", [id]), /imutáveis/);
    await assert.rejects(db.query("DELETE FROM web_sales_projection_snapshots WHERE id=$1", [id]), /imutáveis/);
    const query = (sql: string, args?: any[]) =>
      db.query(sql.replace("BEGIN READ WRITE", "BEGIN"), args);
    g.historyPool = { connect: async () => ({ query, release() {} }) };
    await assert.rejects(snapshotDelete(id, "2026-11"), SnapshotInputError);
    assert.equal(
      (await db.query("SELECT * FROM web_sales_projection_snapshots")).rows
        .length,
      2,
    );
    await assert.rejects(
      snapshotDelete("invalid", "2026-10"),
      SnapshotInputError,
    );
    assert.deepEqual(await snapshotDelete(id, "2026-10"), { id });
    assert.equal(
      (await db.query("SELECT * FROM web_sales_projection_snapshots")).rows
        .length,
      1,
    );
    await assert.rejects(snapshotDelete(id, "2026-10"), SnapshotInputError);
    await assert.rejects(db.query("DELETE FROM web_sales_projection_snapshots"), /imutáveis/);
  } finally {
    g.historyPool = previous;
    await db.close();
  }
});
test("DELETE checks origin and admin before mutating", async () => {
  const result = await build({
    entryPoints: ["app/api/sales-projection/snapshots/route.ts"],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "dependencies",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\// }, (a) => ({
            path: a.path,
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            contents: a.path.endsWith("/auth")
              ? 'export class Forbidden extends Error {}; export class Unauthorized extends Error {}; export const sameOrigin = r => r.headers.get("origin") === "https://app.test"; export async function requireAdmin() { if (!globalThis.testAdmin) throw new Forbidden(); } export async function requireUser() {}'
              : "export class SnapshotInputError extends Error {}; export const snapshotPeriod = p => p; export const snapshotDelete = async (id,period) => { globalThis.testDeleted++; return {id,period}; }; export const snapshotRead = ()=>{}; export const snapshotList = ()=>{}; export const snapshotCreate = ()=>{};",
          }));
        },
      },
    ],
  });
  const module = { exports: {} as any };
  new Function("module", "exports", result.outputFiles[0].text)(
    module,
    module.exports,
  );
  const g = globalThis as any;
  g.testAdmin = false;
  g.testDeleted = 0;
  const request = (origin: string) =>
    new Request(
      "https://app.test/api/sales-projection/snapshots?period=2026-10&id=test",
      { method: "DELETE", headers: { origin } },
    );
  try {
    assert.equal(
      (await module.exports.DELETE(request("https://other.test"))).status,
      403,
    );
    assert.equal(
      (await module.exports.DELETE(request("https://app.test"))).status,
      403,
    );
    assert.equal(g.testDeleted, 0);
    g.testAdmin = true;
    assert.equal(
      (await module.exports.DELETE(request("https://app.test"))).status,
      200,
    );
    assert.equal(g.testDeleted, 1);
  } finally {
    delete g.testAdmin;
    delete g.testDeleted;
  }
});
