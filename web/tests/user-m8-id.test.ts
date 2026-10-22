import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { setAccess } from "../lib/admin-store";
import { employeeFields } from "../lib/employees";
test("administrator stores and clears the technician M8 ID without changing other employees", async () => {
  const db = new PGlite(),
    g = globalThis as any,
    old = g.historyPool;
  try {
    await db.exec("CREATE ROLE anon;CREATE ROLE authenticated");
    for (const name of [
      "008_administration",
      "009_employees",
      "021_employee_task_color",
    ])
      await db.exec(
        readFileSync(
          new URL("../sql/" + name + ".sql", import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      "ALTER TABLE web_user_access ADD COLUMN m8_employee_id integer CHECK(m8_employee_id>0)",
    );
    const query = db.query.bind(db);
    g.historyPool = { query, connect: async () => ({ query, release() {} }) };
    const user = {
      email: "tech@example.com",
      display_name: "Técnico",
      department: "AT",
      job_title: "Técnico",
      phone: "",
      role: "user",
      enabled: true,
      alert_preventive: false,
      alert_rental: false,
      alert_email: true,
      alert_whatsapp: false,
      m8_employee_id: "1234",
    };
    const admin = { id: "admin", email: "guih.waltrick@gmail.com" };
    await setAccess(user, admin);
    assert.equal(
      (
        await db.query<any>(
          "SELECT m8_employee_id FROM web_user_access WHERE email=$1",
          [user.email],
        )
      ).rows[0].m8_employee_id,
      1234,
    );
    await assert.rejects(
      () =>
        setAccess(
          { ...user, m8_employee_id: "999" },
          { id: "other", email: user.email },
        ),
      /administrador/,
    );
    for (const value of ["0", "-1", "1.5", "abc", "2147483648"])
      assert.throws(
        () => employeeFields({ ...user, m8_employee_id: value }),
        /ID do técnico/,
      );
    const { m8_employee_id, ...withoutId } = user;
    await setAccess(withoutId, admin);
    assert.equal(
      (
        await db.query<any>(
          "SELECT m8_employee_id FROM web_user_access WHERE email=$1",
          [user.email],
        )
      ).rows[0].m8_employee_id,
      1234,
    );
    await setAccess({ ...user, m8_employee_id: "" }, admin);
    assert.equal(
      (
        await db.query<any>(
          "SELECT m8_employee_id FROM web_user_access WHERE email=$1",
          [user.email],
        )
      ).rows[0].m8_employee_id,
      null,
    );
  } finally {
    g.historyPool = old;
    await db.close();
  }
});
