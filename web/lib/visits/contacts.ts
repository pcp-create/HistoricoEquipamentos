import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { Forbidden } from "../auth";
import { AdminInputError } from "../admin-store";
export async function contactAccess(db: any, key: string, email: string) {
  const user = (
    await db.query("SELECT enabled,role FROM web_user_access WHERE email=$1", [
      email,
    ])
  ).rows[0];
  if (!user?.enabled) throw new Forbidden();
  if (/^m8:\d+$/.test(key)) {
    if (
      (
        await db.query(
          "SELECT 1 FROM m8_customer_directory WHERE person_id=$1 LIMIT 1",
          [key.slice(3)],
        )
      ).rows.length
    )
      return;
  } else if (/^lead:[0-9a-f-]{36}$/i.test(key)) {
    if (
      (
        await db.query(
          "SELECT 1 FROM web_sales_leads WHERE id=$1 AND (owner=$2 OR $3)",
          [key.slice(5), email, user.role === "admin"],
        )
      ).rows.length
    )
      return;
  }
  throw new Forbidden();
}
export async function listCustomerContacts(key: string, email: string) {
  const db = database();
  await contactAccess(db, key, email);
  return (
    await db.query(
      "SELECT id,name,phone FROM web_customer_contacts WHERE customer_key=$1 ORDER BY lower(name),id",
      [key],
    )
  ).rows;
}
export async function storeContact(
  db: any,
  key: string,
  b: any,
  email: string,
) {
  const name = typeof b.name === "string" ? b.name.trim() : "",
    phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (!name || name.length > 160 || !/^[+()\d\s.-]{8,40}$/.test(phone))
    throw new AdminInputError(
      "Informe o nome e um telefone válido do contato.",
    );
  return (
    await db.query(
      "INSERT INTO web_customer_contacts(id,customer_key,name,phone,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(customer_key,name,phone) DO UPDATE SET name=EXCLUDED.name RETURNING id,name,phone",
      [randomUUID(), key, name, phone, email],
    )
  ).rows[0];
}
export async function createCustomerContact(
  key: string,
  b: any,
  email: string,
) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await contactAccess(c, key, email);
    const row = await storeContact(c, key, b, email);
    await c.query("COMMIT");
    return row;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
