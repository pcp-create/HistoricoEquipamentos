import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import { canManageVisits } from "../access-roles";
import { CrmError, text } from "./model";
export async function crmDirectory(
  kind: string,
  q: string,
  page: number,
  actor: string,
) {
  if (
    !["leads", "customers", "contacts"].includes(kind) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000
  )
    throw new CrmError("Consulta inválida.");
  const db = database(),
    user = (
      await db.query(
        "SELECT enabled,role FROM web_user_access WHERE email=$1",
        [actor],
      )
    ).rows[0];
  if (!user?.enabled) throw new Forbidden();
  const all = canManageVisits(user.role),
    search = "%" + text(q, 150).replace(/[\\%_]/g, "\\$&") + "%";
  const customers = `SELECT DISTINCT ON(person_id) person_id,name,document,payload FROM m8_customer_directory ORDER BY person_id,collected_at DESC,company_id`;
  const source =
    kind === "leads"
      ? `SELECT l.id::text,l.name,l.city,l.uf,l.address,l.created_at,l.owner,COALESCE(u.display_name,l.owner) owner_name,'' document,'' email,'' phone FROM web_sales_leads l LEFT JOIN web_user_access u ON u.email=l.owner WHERE l.owner=$1 OR $2`
      : kind === "customers"
        ? `SELECT person_id::text id,name,document,payload->>'municipioNome' city,payload->>'ufSigla' uf,concat_ws(', ',payload->>'logradouro',payload->>'numero',payload->>'bairro') address,COALESCE(payload->>'telefone','') phone,COALESCE(payload->>'email','') email FROM (${customers}) d WHERE $1::text IS NOT NULL AND $2::boolean IS NOT NULL`
        : `SELECT c.id::text,c.customer_key,c.m8_id,c.job_version,c.job_type_override_id::text job_type_id,COALESCE(j.name,c.job_title) job_title,COALESCE(j.m8_id,c.cargo_id) cargo_id,COALESCE(c.field_overrides->>'name',c.name) name,COALESCE(c.field_overrides->>'phone',c.phone) phone,COALESCE(c.field_overrides->>'email',c.email) email,COALESCE(c.field_overrides->>'additional_phone',c.additional_phone) additional_phone,COALESCE(c.field_overrides->>'document',c.document) document,COALESCE(c.field_overrides->>'notes',c.notes) notes,COALESCE(d.name,l.name) customer_name FROM web_customer_contacts c LEFT JOIN (${customers}) d ON c.customer_key='m8:'||d.person_id::text LEFT JOIN web_sales_leads l ON c.customer_key='lead:'||l.id::text LEFT JOIN web_contact_job_types j ON j.id=c.job_type_override_id WHERE c.integration_state NOT IN ('sending','uncertain','failed') AND (d.person_id IS NOT NULL OR (l.id IS NOT NULL AND (l.owner=$1 OR $2)))`;
  const from = `WITH records AS (${source}) SELECT * FROM records WHERE concat_ws(' ',name,document,phone,email${kind === "contacts" ? ",customer_name,job_title" : ",city,uf"}) ILIKE $3 ESCAPE '\\'`;
  const args = [actor, all, search];
  const [rows, total] = await Promise.all([
    db.query(from + " ORDER BY lower(name),id LIMIT 30 OFFSET $4", [
      ...args,
      (page - 1) * 30,
    ]),
    db.query("SELECT count(*)::int total FROM (" + from + ") r", args),
  ]);
  return { rows: rows.rows, total: total.rows[0].total, page };
}
