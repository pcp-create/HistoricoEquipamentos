import "server-only";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
import { contactAccess } from "./contacts";
export async function deleteCustomerContact(b: any, actor: string) {
  if (
    typeof b?.contactId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      b.contactId,
    ) ||
    !Number.isSafeInteger(b.version) ||
    b.version < 1
  )
    throw new AdminInputError("Contato inválido. Atualize a lista.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await contactAccess(c, b.customer, actor);
    const row = (
      await c.query(
        "SELECT job_version,deleted_at FROM web_customer_contacts WHERE id=$1 AND customer_key=$2 FOR UPDATE",
        [b.contactId, b.customer],
      )
    ).rows[0];
    if (!row)
      throw new AdminInputError("Contato não encontrado para este cliente.");
    if (row.deleted_at) {
      await c.query("COMMIT");
      return { deleted: true };
    }
    if (row.job_version !== b.version)
      throw new AdminInputError(
        "O contato foi alterado. Atualize antes de excluir.",
      );
    await c.query(
      "UPDATE web_customer_contacts SET deleted_at=now(),deleted_by=$2,sync_requested=false,job_version=job_version+1,job_updated_by=$2,job_updated_at=now() WHERE id=$1",
      [b.contactId, actor],
    );
    await c.query("COMMIT");
    return { deleted: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
