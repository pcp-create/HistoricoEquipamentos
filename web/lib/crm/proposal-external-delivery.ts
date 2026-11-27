import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { CrmError, uuid } from "./model";
import { renderProposalDelivery } from "./proposal-email";

async function check(c: any, id: string, expected: number, revision: number) {
  const p = (
    await c.query(
      "SELECT p.*,o.status opportunity_status FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id WHERE p.id=$1 FOR UPDATE OF p,o",
      [id],
    )
  ).rows[0];
  const w = (
    await c.query(
      "SELECT * FROM crm_proposal_workflows WHERE proposal_id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (
    !p ||
    p.version !== expected ||
    !["reviewed", "sent"].includes(w?.state) ||
    w.revision !== revision
  )
    throw new CrmError(
      "A proposta foi alterada. Atualize e prepare o envio novamente.",
    );
  if (p.status !== "pending" || p.opportunity_status !== "open")
    throw new CrmError("Esta proposta não está disponível para envio.");
  if (
    (
      await c.query(
        "SELECT 1 FROM crm_proposal_email_attempts WHERE proposal_id=$1 AND state IN ('sending','uncertain')",
        [id],
      )
    ).rows.length
  )
    throw new CrmError("Há um envio de e-mail aguardando conferência.");
  return p;
}
/** Preparation does not send anything or change the proposal stage. */
export async function prepareExternalDelivery(
  input: any,
  actor: string,
  render = renderProposalDelivery,
) {
  if (!["manual", "whatsapp"].includes(input.channel))
    throw new CrmError("Canal de envio inválido.");
  const prepared = await render(input),
    deliveryId = randomUUID(),
    c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await check(c, prepared.id, prepared.expected, prepared.revision);
    await c.query(
      "INSERT INTO crm_proposal_external_deliveries(id,proposal_id,proposal_version,revision,channel,document,names,title,pdf,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        deliveryId,
        prepared.id,
        prepared.expected,
        prepared.revision,
        input.channel,
        JSON.stringify(prepared.draft),
        JSON.stringify(prepared.proposal.names),
        prepared.proposal.title,
        Buffer.from(prepared.pdf),
        actor,
      ],
    );
    await c.query("COMMIT");
    return {
      deliveryId,
      filename: `Proposta-${prepared.proposal.number}-Rev-${prepared.revision}.pdf`,
      pdf: Buffer.from(prepared.pdf).toString("base64"),
    };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** User declaration, not a transport receipt. The exact prepared PDF is preserved. */
export async function confirmExternalDelivery(input: any, actor: string) {
  if (input.confirmed !== true)
    throw new CrmError("Confirme que a proposta já foi enviada ao cliente.");
  const id = uuid(input.id),
    deliveryId = uuid(input.deliveryId),
    c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const delivery = (
      await c.query(
        "SELECT * FROM crm_proposal_external_deliveries WHERE id=$1 AND proposal_id=$2 AND created_by=$3",
        [deliveryId, id, actor],
      )
    ).rows[0];
    if (!delivery) throw new CrmError("Envio preparado não encontrado.");
    if (delivery.confirmed_at) {
      await c.query("COMMIT");
      return { revision: delivery.revision };
    }
    const p = await check(c, id, delivery.proposal_version, delivery.revision);
    await c.query(
      "INSERT INTO crm_proposal_sent_revisions(proposal_id,revision,proposal_version,document,names,title,pdf,sent_by,recipients,gmail_message_id,delivery_channel) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10) ON CONFLICT(proposal_id,revision) DO NOTHING",
      [
        id,
        delivery.revision,
        delivery.proposal_version,
        delivery.document,
        delivery.names,
        delivery.title,
        delivery.pdf,
        actor,
        delivery.channel === "whatsapp"
          ? "WhatsApp · envio confirmado pelo usuário"
          : "Envio anterior confirmado pelo usuário",
        delivery.channel,
      ],
    );
    await c.query(
      "UPDATE crm_proposal_workflows SET state='sent',last_sent_revision=$2,updated_at=CASE WHEN state='sent' THEN updated_at ELSE now() END WHERE proposal_id=$1",
      [id, delivery.revision],
    );
    await c.query(
      "UPDATE crm_proposals SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1",
      [id, actor],
    );
    await c.query(
      "UPDATE crm_proposal_external_deliveries SET confirmed_at=now() WHERE id=$1",
      [deliveryId],
    );
    await c.query(
      "INSERT INTO crm_events(opportunity_id,proposal_id,actor,action,details) VALUES($1,$2,$3,'proposal_sent',$4)",
      [
        p.opportunity_id,
        id,
        actor,
        JSON.stringify({
          revision: delivery.revision,
          channel: delivery.channel,
          confirmation: "user",
        }),
      ],
    );
    await c.query("COMMIT");
    return { revision: delivery.revision };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
