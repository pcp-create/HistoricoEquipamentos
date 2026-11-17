import { after } from "next/server";
import { requireUser, sameOrigin, Forbidden, Unauthorized } from "@/lib/auth";
import { database } from "@/lib/db";
import { contactAccess } from "@/lib/visits/contacts";
import { syncContact } from "@/lib/visits/contact-sync";
const json = (body: any, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  try {
    const u = await requireUser(),
      db = database();
    if (
      !(
        await db.query(
          "SELECT 1 FROM web_user_access WHERE email=$1 AND enabled",
          [u.email],
        )
      ).rows.length
    )
      throw new Forbidden();
    const rows = (
      await db.query(
        `SELECT c.*,COALESCE(c.field_overrides->>'name',c.name) name,COALESCE(c.field_overrides->>'phone',c.phone) phone,COALESCE(c.field_overrides->>'email',c.email) email,COALESCE(c.field_overrides->>'additional_phone',c.additional_phone) additional_phone,COALESCE(c.field_overrides->>'document',c.document) document,COALESCE(c.field_overrides->>'notes',c.notes) notes,COALESCE(j.name,c.job_title) job_title,COALESCE(j.m8_id,c.cargo_id) cargo_id,c.job_type_override_id::text job_type_id,(SELECT name FROM m8_customer_directory WHERE person_id::text=substring(c.customer_key from 4) LIMIT 1) customer_name FROM web_customer_contacts c LEFT JOIN web_contact_job_types j ON j.id=c.job_type_override_id WHERE c.customer_key LIKE 'm8:%' AND (sync_requested OR integration_state IN ('sending','uncertain','failed')) ORDER BY c.created_at,c.id`,
      )
    ).rows;
    return json({ rows });
  } catch (e) {
    return json(
      { error: "Não foi possível consultar as pendências." },
      e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503,
    );
  }
}
export async function POST(r: Request) {
  if (!sameOrigin(r)) return json({ error: "Origem inválida." }, 403);
  try {
    const u = await requireUser(),
      b = await r.json();
    if (typeof b.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id))
      return json({ error: "Contato inválido." }, 400);
    const db = database(),
      row = (
        await db.query(
          "SELECT customer_key FROM web_customer_contacts WHERE id=$1",
          [b.id],
        )
      ).rows[0];
    if (!row) throw new Forbidden();
    await contactAccess(db, row.customer_key, u.email);
    after(() => syncContact(b.id, u.email));
    return json({ queued: true });
  } catch (e) {
    return json(
      { error: "Não foi possível solicitar a conferência." },
      e instanceof Unauthorized ? 401 : e instanceof Forbidden ? 403 : 503,
    );
  }
}

export const maxDuration = 120;
