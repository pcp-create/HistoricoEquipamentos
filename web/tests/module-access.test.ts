import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { defaultModules, hasModule, canOpenModulePage } from "../lib/module-access";
import { setAccess } from "../lib/admin-store";
import { resolveInitialSession } from "../lib/initial-access";

test("all enabled employees have every module regardless of previous selections", () => {
  for (const modules of [undefined, [], ["crm"]]) {
    for (const id of defaultModules) assert.equal(hasModule({ enabled: true, modules }, id), true);
  }
  assert.equal(hasModule({ enabled: false }, "tecnico"), false);
  assert.equal(hasModule(null, "programacao"), false);
  assert.equal(hasModule({ enabled: true }, "unknown"), false);
  assert.equal(canOpenModulePage(defaultModules, "/programacao"), true);
  assert.equal(canOpenModulePage(defaultModules, "/tecnico"), true);
});

test("legacy module restrictions no longer affect sessions; disabled accounts and admin actions remain protected", async () => {
  const db = new PGlite(), g = globalThis as any, old = g.historyPool;
  const admin = { id: "admin", email: "guih.waltrick@gmail.com" };
  const tech = { id: "tech", email: "tech@example.test" };
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
    await db.exec(readFileSync(new URL("../sql/008_administration.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../sql/048_user_modules.sql", import.meta.url), "utf8"));
    await db.query("INSERT INTO web_user_access(email,enabled,updated_by,modules) VALUES($1,true,$1,'[]')", [tech.email]);
    const query = db.query.bind(db); g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const request = async () => Response.json({ ...tech, email_confirmed_at: "2026-01-01", is_anonymous: false });
    const access = await resolveInitialSession("token", request);
    assert.deepEqual(access.modules, defaultModules);
    assert.equal(access.admin, false);
    await assert.rejects(setAccess({ email: tech.email, role: "admin", enabled: true }, tech));
    // Even an old browser submitting module selections cannot restrict the employee.
    await setAccess({ email: tech.email, role: "user", enabled: true, modules: [] }, admin);
    assert.deepEqual((await resolveInitialSession("token", request)).modules, defaultModules);
    await setAccess({ email: tech.email, role: "user", enabled: false }, admin);
    assert.deepEqual((await resolveInitialSession("token", request)).modules, []);
  } finally { g.historyPool = old; await db.close(); }
});
