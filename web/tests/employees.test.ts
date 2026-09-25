import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { employeeFields, alertRecipients } from "../lib/employees";
import { setAccess, recordActivity } from "../lib/admin-store";
import { createEmployeeLogin } from "../lib/employee-login";
const employee = {
  email: "person@example.com",
  display_name: "Nome cadastrado",
  department: "PCP",
  job_title: "Planejador",
  phone: "+55 (47) 99999-9999",
  task_color: "#34d399",
  role: "user",
  enabled: true,
  alert_preventive: true,
  alert_rental: false,
  alert_email: true,
  alert_whatsapp: true,
};
test("employee opt-ins, blocked access, deduplication and registered name survive authentication", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated");
    for (const f of ["008_administration.sql", "009_employees.sql", "021_employee_task_color.sql"])
      await db.exec(
        readFileSync(new URL("../sql/" + f, import.meta.url), "utf8"),
      );
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const admin = { id: "a", email: "guih.waltrick@gmail.com" };
    await assert.rejects(
      () =>
        setAccess({ ...employee, email: admin.email, mode: "create" }, admin),
      /Já existe/,
    );
    assert.equal(
      (
        await db.query<{ role: string }>(
          "SELECT role FROM web_user_access WHERE email=$1",
          [admin.email],
        )
      ).rows[0].role,
      "admin",
    );
    await setAccess({ ...employee, mode: "create" }, admin);
    await setAccess(
      { ...employee, email: "other@example.com", alert_email: false },
      admin,
    );
    assert.deepEqual(await alertRecipients("preventive"), {
      emails: [employee.email],
      whatsapp: ["5547999999999"],
    });
    assert.deepEqual(await alertRecipients("rental"), {
      emails: [],
      whatsapp: [],
    });
    await recordActivity(
      {
        id: "u",
        email: employee.email,
        user_metadata: { full_name: "Nome antigo" },
      },
      "login",
    );
    assert.equal(
      (
        await db.query<{ display_name: string }>(
          "SELECT display_name FROM web_user_access WHERE email=$1",
          [employee.email],
        )
      ).rows[0].display_name,
      employee.display_name,
    );
    await setAccess({ ...employee, enabled: false }, admin);
    assert.deepEqual((await alertRecipients("preventive")).emails, []);
    await assert.rejects(
      () => setAccess({ ...employee, phone: "" }, admin),
      /telefone/,
    );
    await assert.rejects(
      () => setAccess(employee, { id: "x", email: "intruder@example.com" }),
      /administrador/,
    );
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
test("contact validation rejects missing channels and invalid numbers", () => {
  assert.equal(employeeFields(employee).phone, "5547999999999");
  assert.throws(() => employeeFields({ ...employee, phone: "abc" }));
  assert.throws(() =>
    employeeFields({ ...employee, alert_email: false, alert_whatsapp: false }),
  );
  assert.throws(() => employeeFields({ ...employee, alert_rental: "true" }));
});
test("account provisioning never returns or records passwords and rejects unregistered employees", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool,
    fetchOld = globalThis.fetch,
    env = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated");
    for (const f of ["008_administration.sql", "009_employees.sql", "021_employee_task_color.sql"])
      await db.exec(
        readFileSync(new URL("../sql/" + f, import.meta.url), "utf8"),
      );
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    process.env.SUPABASE_URL = "https://example.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
    const admin = { id: "a", email: "guih.waltrick@gmail.com" };
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ id: "new-user" });
    };
    await assert.rejects(() =>
      createEmployeeLogin(
        { email: employee.email, password: "initial-password" },
        admin,
      ),
    );
    assert.equal(calls, 0);
    await setAccess(employee, admin);
    assert.equal((await db.query<{task_color:string}>("SELECT task_color FROM web_user_access WHERE email=$1", [employee.email])).rows[0].task_color, "#34d399");
    await assert.rejects(() => createEmployeeLogin({email: employee.email, password: "abc12"}, admin), /6 a 128/);
    assert.equal(calls, 0);
    await createEmployeeLogin(
      { email: employee.email, password: "abc123" },
      admin,
    );
    assert.equal(calls, 1);
    await assert.rejects(
      () =>
        createEmployeeLogin(
          { email: employee.email, password: "another-password" },
          admin,
        ),
      /já possui/,
    );
    assert.equal(calls, 1);
    const events = await db.query("SELECT * FROM web_access_events");
    assert.ok(!JSON.stringify(events.rows).includes("password"));
  } finally {
    globalThis.fetch = fetchOld;
    g.historyPool = old;
    for (const [k, v] of [
      ["SUPABASE_URL", env.url],
      ["SUPABASE_SERVICE_ROLE_KEY", env.key],
    ]) {
      if (v === undefined) delete process.env[k!];
      else process.env[k!] = v;
    }
    await db.close();
  }
});

test("employee task color validates hexadecimal colors", () => { assert.throws(() => employeeFields({ ...employee, task_color: "red; background:url(x)" }), /cor válida/); assert.equal(employeeFields(employee).task_color, "#34d399"); });
