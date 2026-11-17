import { canManageVisits } from "../access-roles";
import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { Forbidden } from "../auth";
import { AdminInputError } from "../admin-store";
import { m8Session } from "../service-orders/m8";
import { selectedJobType } from "./job-types";
import { contactPayload, fetchM8Contacts } from "./m8-contacts";
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
          [key.slice(5), email, canManageVisits(user.role)],
        )
      ).rows.length
    )
      return;
  }
  throw new Forbidden();
}
export async function contactCompany(db: any, key: string) {
  return Number(
    (
      await db.query(
        "SELECT company_id FROM m8_customer_directory WHERE person_id=$1 AND company_id IN (1,2,27404) ORDER BY CASE company_id WHEN 1 THEN 0 ELSE 1 END,company_id LIMIT 1",
        [key.slice(3)],
      )
    ).rows[0]?.company_id,
  );
}
export async function refreshCustomerContacts(
  key: string,
  email: string,
  session = m8Session,
) {
  const db = database();
  await contactAccess(db, key, email);
  if (key.startsWith("m8:")) {
    const company = await contactCompany(db, key),
      request = await session(company);
    const contacts = await fetchM8Contacts(request, key.slice(3));
    const c = await db.connect();
    try {
      await c.query("BEGIN READ WRITE");
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "m8-contact-sync:" + key,
      ]);
      for (const row of contacts) {
        const previous = (
          await c.query(
            "SELECT id FROM web_customer_contacts WHERE customer_key=$1 AND company_id=$2 AND m8_id=$3 FOR UPDATE",
            [key, company, row.id],
          )
        ).rows[0];
        const matching =
          previous ||
          (
            await c.query(
              "SELECT id,m8_id FROM web_customer_contacts WHERE customer_key=$1 AND m8_id IS NULL AND lower(trim(name))=lower(trim($2)) AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace($3,'[^0-9]','','g') ORDER BY m8_id NULLS FIRST LIMIT 1 FOR UPDATE",
              [key, row.nome || `Contato M8 ${row.id}`, row.telefone || ""],
            )
          ).rows[0];
        const id =
          matching?.id ||
          (
            await storeContact(
              c,
              key,
              {
                name: row.nome || `Contato M8 ${row.id}`,
                phone: row.telefone || "",
              },
              email,
              true,
            )
          ).id;
        await c.query(
          `UPDATE web_customer_contacts SET m8_id=$2,company_id=$3,email=$4,job_title=COALESCE(NULLIF($5,''),(SELECT name FROM web_contact_job_types WHERE m8_id=$7),''),contact_type=$6,cargo_id=$7,additional_phone=$8,document=$9,notes=$10,name=$11,phone=$12,integration_state=CASE WHEN sync_requested THEN integration_state ELSE 'synced' END WHERE id=$1 AND NOT sync_requested AND deleted_at IS NULL`,
          [
            id,
            row.id,
            company,
            row.email || "",
            row.cargoNome || "",
            row.tipo || "Geral",
            row.cargoId,
            row.telefoneAdicional || "",
            row.cpfCnpj || "",
            row.observacao || "",
            row.nome || `Contato M8 ${row.id}`,
            row.telefone || "",
          ],
        );
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return (
    await db.query(
      `SELECT c.id,COALESCE(c.field_overrides->>'name',c.name) name,COALESCE(c.field_overrides->>'phone',c.phone) phone,COALESCE(c.field_overrides->>'email',c.email) email,COALESCE(c.field_overrides->>'additional_phone',c.additional_phone) additional_phone,COALESCE(c.field_overrides->>'document',c.document) document,COALESCE(c.field_overrides->>'notes',c.notes) notes,c.contact_type,COALESCE(j.name,c.job_title) job_title,COALESCE(j.m8_id,c.cargo_id) cargo_id,c.m8_id,c.integration_state,c.sync_requested,c.sync_error,c.job_version,c.job_type_override_id::text job_type_id FROM web_customer_contacts c LEFT JOIN web_contact_job_types j ON j.id=c.job_type_override_id WHERE c.customer_key=$1 AND c.deleted_at IS NULL ORDER BY lower(COALESCE(c.field_overrides->>'name',c.name)),c.id`,
      [key],
    )
  ).rows;
}

export async function storeContact(
  db: any,
  key: string,
  b: any,
  email: string,
  imported = false,
) {
  const name = typeof b.name === "string" ? b.name.trim() : "",
    phone = typeof b.phone === "string" ? b.phone.trim() : "";
  if (
    !name ||
    name.length > 160 ||
    (!imported && !/^[+()\d\s.-]{8,40}$/.test(phone))
  )
    throw new AdminInputError(
      "Informe o nome e um telefone válido do contato.",
    );
  return (
    await db.query(
      "INSERT INTO web_customer_contacts(id,customer_key,name,phone,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(customer_key,name,phone) WHERE m8_id IS NULL DO UPDATE SET name=EXCLUDED.name RETURNING id,name,phone",
      [randomUUID(), key, name, phone, email],
    )
  ).rows[0];
}
export async function createCustomerContact(
  key: string,
  b: any,
  email: string,
  session = m8Session,
) {
  if (!/^m8:\d+$/.test(key || "")) {
    const c = await database().connect();
    try {
      await c.query("BEGIN READ WRITE");
      await contactAccess(c, key, email);
      const row = await storeContact(c, key, b, email);
      await c.query("UPDATE web_customer_contacts SET deleted_at=NULL,deleted_by=NULL,job_version=job_version+1 WHERE id=$1 AND deleted_at IS NOT NULL",[row.id]);
      await c.query("COMMIT");
      return (await c.query("SELECT * FROM web_customer_contacts WHERE id=$1",[row.id])).rows[0];
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  const db = database();
  await contactAccess(db, key, email);
  const job = await selectedJobType(db, b.job_type_id);
  const payload = contactPayload({
    ...b,
    cargo_id: job.m8_id,
    contact_type: "Geral",
  });
  const company = await contactCompany(db, key);
  const c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      key + payload.nome + payload.telefone,
    ]);
    const existing = (
      await c.query(
        "SELECT * FROM web_customer_contacts WHERE customer_key=$1 AND name=$2 AND phone=$3 FOR UPDATE",
        [key, payload.nome, payload.telefone],
      )
    ).rows[0];
    if (existing && !existing.deleted_at) {
      await c.query("COMMIT");
      return existing;
    }
    const row = existing || await storeContact(c, key, b, email);
    const result = (
      await c.query(
        `UPDATE web_customer_contacts SET job_version=job_version+CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END,deleted_at=NULL,deleted_by=NULL,field_overrides='{}'::jsonb,job_type_override_id=NULL,company_id=$2,email=$3,contact_type=$4,cargo_id=$5,additional_phone=$6,document=$7,notes=$8,job_title=$9,sync_requested=true WHERE id=$1 RETURNING *`,
        [
          row.id,
          company,
          payload.email,
          payload.tipo,
          payload.cargoId,
          payload.telefoneAdicional || "",
          payload.cpfCnpj || "",
          payload.observacao || "",
          job.name,
        ],
      )
    ).rows[0];
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function listCustomerContacts(key: string, email: string) {
  const db = database();
  await contactAccess(db, key, email);
  return (
    await db.query(
      `SELECT c.*,COALESCE(c.field_overrides->>'name',c.name) name,COALESCE(c.field_overrides->>'phone',c.phone) phone,COALESCE(c.field_overrides->>'email',c.email) email,COALESCE(c.field_overrides->>'additional_phone',c.additional_phone) additional_phone,COALESCE(c.field_overrides->>'document',c.document) document,COALESCE(c.field_overrides->>'notes',c.notes) notes,COALESCE(j.name,c.job_title) job_title,COALESCE(j.m8_id,c.cargo_id) cargo_id,c.job_type_override_id::text job_type_id FROM web_customer_contacts c LEFT JOIN web_contact_job_types j ON j.id=c.job_type_override_id WHERE customer_key=$1 AND c.deleted_at IS NULL ORDER BY lower(COALESCE(c.field_overrides->>'name',c.name)),c.id`,
      [key],
    )
  ).rows;
}
