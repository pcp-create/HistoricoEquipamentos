import { test } from "node:test";
import assert from "node:assert/strict";
import { resetEmployeePassword } from "../lib/employee-login";

test("reset checks permission, identity and forces default password; audit never contains passwords", async () => {
  const g = globalThis as any, pool = g.historyPool, fetchBefore = globalThis.fetch;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://auth.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const actor = { email: "admin@example.test", id: "admin" } as any;
  const user = { user_id: "user-id", email: "employee@example.test", phone:"5547999999999",enabled:true };
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
    assert.deepEqual(JSON.parse(requests[1].body), { password: "123456", app_metadata:{must_change_password:true} });
    assert.ok(queries.some(q => q.sql.includes("'password_reset'")));
    assert.ok(!JSON.stringify(queries).includes(body.password));
    assert.equal(queries.at(-1).sql, "COMMIT");
    assert.ok(queries.some(q=>q.sql.startsWith('INSERT INTO web_password_reset_notifications')));
    requests.length = 0;
    user.phone='';
    await assert.rejects(resetEmployeePassword(body,actor),/WhatsApp válido/);
    assert.equal(requests.length,0);user.phone='5547999999999';
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

test('pending password blocks protected routes and initial admin rendering',async()=>{
 const {passwordValidation,needsPasswordChange}=await import('../lib/password-policy');
 const {assertPasswordReady,PasswordChangeRequired}=await import('../lib/auth');
 const {resolveInitialSession}=await import('../lib/initial-access');
 const user={id:'id',email:'a@test',email_confirmed_at:'2026-01-01',app_metadata:{must_change_password:true}};
 assert.ok(passwordValidation('123456','123456'));assert.ok(passwordValidation(' 123456 ',' 123456 '));
 assert.ok(passwordValidation('abc','abc'));assert.ok(passwordValidation('different','mismatch'));assert.equal(passwordValidation('new-secret','new-secret'),null);
 assert.throws(()=>assertPasswordReady(user),PasswordChangeRequired);assert.doesNotThrow(()=>assertPasswordReady(user,true));
 assert.equal(needsPasswordChange({app_metadata:{},user_metadata:{must_change_password:true}} as any),false);
 const initial=await resolveInitialSession('token',async()=>Response.json(user),async()=>({enabled:true,role:'admin'}));
 assert.equal(initial.admin,false);assert.equal('mustChangePassword' in initial && initial.mustChangePassword,true);assert.equal(initial.cacheScope,'');
});

test('password change requires pending verified identity and clears only server metadata after success',async()=>{
 const {changeInitialPassword}=await import('../lib/employee-login');
 const g=globalThis as any,oldPool=g.historyPool,oldFetch=globalThis.fetch;
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://auth.example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 const user={id:'u1',email:'a@test'};let pending=true,fail=false;const requests:any[]=[],queries:any[]=[];
 g.historyPool={connect:async()=>({query:async(sql:string,args:any[])=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT enabled')?[{enabled:true}]:[]}},release(){}})};
 globalThis.fetch=(async(_url:any,options:any)=>{requests.push(options);return options.method==='PUT'?Response.json({},{status:fail?422:200}):Response.json({...user,app_metadata:{must_change_password:pending,other:'preserved'}})}) as typeof fetch;
 try{
  await assert.rejects(()=>changeInitialPassword({password:'123456',confirmation:'123456'},user),/diferente/);assert.equal(requests.length,0);
  await changeInitialPassword({password:'personal-password',confirmation:'personal-password'},user);
  assert.deepEqual(JSON.parse(requests[1].body),{password:'personal-password',app_metadata:{must_change_password:false,other:'preserved'}});
  assert.ok(!JSON.stringify(queries).includes('personal-password'));
  pending=false;await assert.rejects(()=>changeInitialPassword({password:'another-secret',confirmation:'another-secret'},user),/pendente/);
  pending=true;fail=true;queries.length=0;await assert.rejects(()=>changeInitialPassword({password:'another-secret',confirmation:'another-secret'},user),/Não foi possível alterar/);assert.ok(!queries.some(q=>q.sql.includes("'password_changed'")));
 }finally{g.historyPool=oldPool;globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey}
});

test('new account uses the automatic password and mandatory change flag',async()=>{
 const {createEmployeeLogin}=await import('../lib/employee-login');
 const g=globalThis as any,oldPool=g.historyPool,oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://auth.example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';let sent:any;const queries:any[]=[];
 g.historyPool={connect:async()=>({query:async(sql:string,args:any[])=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT role')?[{role:'admin',enabled:true}]:sql.startsWith('SELECT *')?[{email:'employee@test',display_name:'Employee',enabled:true}]:[]}},release(){}})};
 globalThis.fetch=(async(_url:any,options:any)=>{sent=JSON.parse(options.body);return Response.json({id:'new-id'})}) as typeof fetch;
 try{await createEmployeeLogin({email:'employee@test'},{email:'admin@test',id:'admin'});assert.equal(sent.password,'123456');assert.deepEqual(sent.app_metadata,{must_change_password:true});assert.ok(!JSON.stringify(queries).includes('123456'))}
 finally{g.historyPool=oldPool;globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey}
});
