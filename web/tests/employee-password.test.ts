import { test } from "node:test";
import assert from "node:assert/strict";
import { resetEmployeePassword } from "../lib/employee-login";

test("reset checks permission, identity and confirmation; audit never contains passwords", async () => {
  const g = globalThis as any, pool = g.historyPool, fetchBefore = globalThis.fetch;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://auth.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const actor = { email: "admin@example.test", id: "admin" } as any;
  const user = { user_id: "user-id", email: "employee@example.test" };
  const body = { email: user.email, password: "new-password", passwordConfirmation: "new-password" };
  let admin = true, enabled = true, linked = true, identityMatches = true, authFails = false;
  const queries: any[] = [], requests: any[] = [];
  g.historyPool = { connect: async () => ({
    query: async (sql: string, args?: any[]) => {
      queries.push({ sql, args });
      if (sql.startsWith("SELECT role")) return { rows: [{ role: admin ? "admin" : "user", enabled }] };
      if (sql.startsWith("SELECT *")) return { rows: linked ? [user] : [] };
      return { rows: [] };
    }, release() {},
  }) };
  globalThis.fetch = (async (_url: any, options: any) => {
    requests.push(options);
    return options.method === "PUT"
      ? Response.json({}, { status: authFails ? 422 : 200 })
      : Response.json({ id: user.user_id, email: identityMatches ? user.email : "other@example.test" });
  }) as typeof fetch;
  try {
    await resetEmployeePassword(body, actor);
    assert.equal(requests[1].method, "PUT");
    assert.deepEqual(JSON.parse(requests[1].body), { password: body.password });
    assert.ok(queries.some(q => q.sql.includes("'password_reset'")));
    assert.ok(!JSON.stringify(queries).includes(body.password));
    assert.equal(queries.at(-1).sql, "COMMIT");
    requests.length = 0;
    await assert.rejects(resetEmployeePassword({ ...body, passwordConfirmation: "wrong" }, actor), /confirme/);
    admin = false;
    await assert.rejects(resetEmployeePassword(body, actor), /administrador/);
    admin = true; enabled = false;
    await assert.rejects(resetEmployeePassword(body, actor), /administrador/);
    enabled = true; linked = false;
    await assert.rejects(resetEmployeePassword(body, actor), /vinculada/);
    assert.equal(requests.length, 0);
    linked = true; identityMatches = false;
    await assert.rejects(resetEmployeePassword(body, actor), /não corresponde/);
    assert.ok(!requests.some(r => r.method === "PUT"));
    identityMatches = true; authFails = true; queries.length = 0;
    await assert.rejects(resetEmployeePassword(body, actor), /Não foi possível redefinir/);
    assert.ok(!queries.some(q => q.sql.includes("'password_reset'")));
    assert.equal(queries.at(-1).sql, "ROLLBACK");
  } finally {
    g.historyPool = pool; globalThis.fetch = fetchBefore;
    if (url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = url;
    if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }
});
