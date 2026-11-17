import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { contactAccess, contactCompany } from "./contacts";
import { m8Session, M8RequestError } from "../service-orders/m8";
import { contactPayload, fetchM8Contacts } from "./m8-contacts";
import { AdminInputError } from "../admin-store";

export function contactMatches(payload: any, remote: any) {
  return Object.keys(payload).every(
    (key) =>
      String(payload[key] ?? "").trim() === String(remote[key] ?? "").trim(),
  );
}
// Persist the reservation before any write; uncertain creates are reconciled, never blindly repeated.
export async function syncContact(
  id: string,
  actor: string,
  session = m8Session,
) {
  const c = await database().connect(),
    claim = randomUUID();
  let row: any,
    payload: any,
    request: any,
    locked = false;
  try {
    await c.query("BEGIN READ WRITE");
    locked =
      (
        await c.query(
          "UPDATE web_customer_contacts SET sync_claim=$2,sync_claimed_at=now() WHERE id=$1 AND deleted_at IS NULL AND (sync_claim IS NULL OR sync_claimed_at<now()-interval '2 minutes') RETURNING id",
          [id, claim],
        )
      ).rows.length > 0;
    if (!locked) {
      await c.query("ROLLBACK");
      return;
    }
    row = (
      await c.query(
        "SELECT c.*,COALESCE(j.m8_id,c.cargo_id) effective_cargo FROM web_customer_contacts c LEFT JOIN web_contact_job_types j ON j.id=c.job_type_override_id WHERE c.id=$1 FOR UPDATE OF c",
        [id],
      )
    ).rows[0];
    if (!row) {
      await c.query("ROLLBACK");
      return;
    }
    await contactAccess(c, row.customer_key, actor);
    if (!row.sync_requested || !row.customer_key.startsWith("m8:")) {
      await c.query("COMMIT");
      return;
    }
    const company =
      row.company_id || (await contactCompany(c, row.customer_key));
    payload = contactPayload({
      ...row,
      ...row.field_overrides,
      cargo_id: row.effective_cargo,
    });
    await c.query("COMMIT");
    request = await session(company);
    const remote = await fetchM8Contacts(request, row.customer_key.slice(3));
    const match = row.m8_id
      ? remote.find((x) => String(x.id) === String(row.m8_id))
      : remote.find((x) => contactMatches(payload, x));
    await c.query("BEGIN READ WRITE");
    const latest = (
      await c.query(
        "SELECT job_version,sync_claim,deleted_at FROM web_customer_contacts WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (
      latest?.deleted_at || latest?.job_version !== row.job_version ||
      latest?.sync_claim !== claim
    ) {
      await c.query("COMMIT");
      return;
    }
    if (match && contactMatches(payload, match)) {
      await c.query(
        "UPDATE web_customer_contacts SET m8_id=$2,company_id=$3,sync_requested=false,integration_state='synced',sync_error='',sync_attempted_at=now() WHERE id=$1",
        [id, match.id, company],
      );
      await c.query("COMMIT");
      return;
    }
    if (row.m8_id)
      throw new AdminInputError(
        "Alteração salva no sistema. A API M8 disponível não oferece edição de contatos. Corrija o contato no M8 e use Conferir no M8.",
      );
    if (["sending", "uncertain"].includes(row.integration_state))
      throw new AdminInputError(
        "Envio anterior sem confirmação. Confira no M8 antes de tentar uma nova inclusão; o contato não foi reenviado para evitar duplicidade.",
      );
    if (
      remote.some(
        (contact: any) =>
          String(contact.nome || "")
            .trim()
            .toLocaleLowerCase() === payload.nome.toLocaleLowerCase() &&
          String(contact.telefone || "").replace(/\D/g, "") ===
            payload.telefone.replace(/\D/g, ""),
      )
    )
      throw new AdminInputError(
        "Já existe um contato com este nome e telefone no M8, mas os dados diferem. Confira e ajuste os dados antes de sincronizar para evitar duplicidade.",
      );
    if (!payload.email)
      throw new AdminInputError(
        "O M8 exige e-mail. Edite o contato e informe um e-mail válido para sincronizar.",
      );
    await c.query(
      "UPDATE web_customer_contacts SET integration_state='sending',company_id=$2,sync_attempts=sync_attempts+1,sync_attempted_at=now(),sync_error='' WHERE id=$1",
      [id, company],
    );
    await c.query("COMMIT");
    let result: any;
    try {
      result = await request(
        `/v1/configuracoes/cliente/${row.customer_key.slice(3)}/contato`,
        payload,
      );
      if (!Number.isSafeInteger(result?.id) || result.id < 1)
        throw new M8RequestError("O M8 não confirmou o ID do contato.", true);
    } catch (e) {
      await c.query("BEGIN READ WRITE");
      await c.query(
        "UPDATE web_customer_contacts SET integration_state=$2,sync_error=$3 WHERE id=$1",
        [
          id,
          e instanceof M8RequestError && !e.uncertain ? "failed" : "uncertain",
          (e as Error).message.slice(0, 2000),
        ],
      );
      await c.query("COMMIT");
      return;
    }
    await c.query("BEGIN READ WRITE");
    await c.query(
      "UPDATE web_customer_contacts SET m8_id=$2,integration_state='synced',sync_requested=(deleted_at IS NULL AND job_version<>$3),sync_error='' WHERE id=$1",
      [id, result.id, row.job_version],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    if (row) {
      await c.query("BEGIN READ WRITE");
      await c.query(
        "UPDATE web_customer_contacts SET sync_error=$2,sync_attempted_at=now() WHERE id=$1",
        [
          id,
          (e instanceof AdminInputError || e instanceof M8RequestError
            ? e.message
            : "Não foi possível consultar o M8. Tente novamente."
          ).slice(0, 2000),
        ],
      );
      await c.query("COMMIT");
    }
  } finally {
    if (locked) {
      await c.query("BEGIN READ WRITE");
      await c.query(
        "UPDATE web_customer_contacts SET sync_claim=NULL,sync_claimed_at=NULL WHERE id=$1 AND sync_claim=$2",
        [id, claim],
      );
      await c.query("COMMIT");
    }
    c.release();
  }
}
