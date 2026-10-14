import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { defaultModules, hasModule, validateModules, canOpenModulePage } from "../lib/module-access";
import { accessRecord, setAccess } from "../lib/admin-store";
import { resolveInitialSession } from "../lib/initial-access";

test("module access is explicit even for admins, rejects invalid grants and preserves shared screens", () => {
  assert.equal(hasModule({ enabled: true }, "tecnico"), false);
  assert.equal(hasModule({ enabled: true, modules: [] }, "crm"), false);
  assert.equal(hasModule({ enabled: false, modules: ["tecnico"] }, "tecnico"), false);
  assert.equal(hasModule({ enabled: true, modules: ["tecnico"] }, "tecnico"), true);
  assert.equal(canOpenModulePage(["assistencia-tecnica"], "/programacao"), false);
  assert.equal(canOpenModulePage(["assistencia-tecnica"], "/equipamentos"), true);
  assert.throws(() => validateModules(["administrador"]));
  assert.throws(() => validateModules(["crm", "crm"]));
  assert.deepEqual(validateModules([]), []);
});

test("migration preserves common modules; only admins can grant/revoke and new sessions reflect changes", async () => {
  const db=new PGlite(), g=globalThis as any, old=g.historyPool;
  const admin={id:"admin",email:"guih.waltrick@gmail.com"};
  const tech={id:"tech",email:"tech@example.test"};
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
    await db.exec(readFileSync(new URL("../sql/008_administration.sql",import.meta.url),"utf8"));
    await db.query("INSERT INTO web_user_access(email,enabled,updated_by) VALUES($1,true,$1)",[tech.email]);
    await db.exec(readFileSync(new URL("../sql/048_user_modules.sql",import.meta.url),"utf8"));
    const query=db.query.bind(db);g.historyPool={query,connect:async()=>({query,release(){}})};
    assert.deepEqual((await accessRecord(tech.email)).modules,defaultModules);
    assert.deepEqual((await accessRecord(admin.email)).modules,defaultModules);
    await assert.rejects(setAccess({email:tech.email,role:"user",enabled:true,modules:["tecnico"]},tech));
    await setAccess({email:tech.email,role:"user",enabled:true,modules:["tecnico","programacao"]},admin);
    const request=async()=>Response.json({...tech,email_confirmed_at:"2026-01-01",is_anonymous:false});
    const granted=await resolveInitialSession("token",request);
    assert.equal(granted.admin,false);
    assert.deepEqual(granted.modules,["programacao","tecnico"]);
    await setAccess({email:tech.email,role:"user",enabled:true,modules:[]},admin);
    const revoked=await resolveInitialSession("token",request);
    assert.deepEqual(revoked.modules,[]);
    assert.notEqual(revoked.cacheScope,granted.cacheScope);
    await assert.rejects(setAccess({email:tech.email,role:"user",enabled:true,modules:["unknown"]},admin));
    assert.deepEqual((await accessRecord(tech.email)).modules,[]);
    const events=(await db.query("SELECT details FROM web_access_events WHERE event='access_changed'")).rows as any[];
    assert.ok(events.some(e=>e.details.after.modules.includes("tecnico")));
  } finally {g.historyPool=old;await db.close();}
});
