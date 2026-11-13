import "server-only";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
import { contactAccess } from "./contacts";
import { selectedJobType } from "./job-types";
export async function updateContactJob(b: any, actor: string) {
  if (
    typeof b.contactId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      b.contactId,
    ) ||
    !Number.isSafeInteger(b.version) ||
    b.version < 1
  )
    throw new AdminInputError(
      "Contato inválido. Atualize a lista antes de editar.",
    );
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await contactAccess(c, b.customer, actor);
    const job = await selectedJobType(c, b.jobTypeId);
    const row = (
      await c.query(
        `UPDATE web_customer_contacts SET job_type_override_id=$3,job_version=job_version+1,job_updated_by=$4,job_updated_at=now() WHERE id=$1 AND customer_key=$2 AND job_version=$5 AND integration_state NOT IN ('sending','uncertain','failed') RETURNING id,name,phone,email,m8_id,job_version,job_type_override_id::text job_type_id`,
        [b.contactId, b.customer, job.id, actor, b.version],
      )
    ).rows[0];
    if (!row)
      throw new AdminInputError(
        "O contato foi alterado ou não pertence a este cliente. Atualize a lista antes de editar.",
      );
    await c.query("COMMIT");
    return { ...row, job_title: job.name, cargo_id: job.m8_id };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
