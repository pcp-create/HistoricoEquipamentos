import "server-only";
import { queueServiceMessage } from "./notifications";
import { companyName } from "../company-names";
import { PUBLIC_SYSTEM_URL } from "../public-url";

function roles(document: any) {
  const result = new Map<string, string>();
  for (const email of document.support || []) result.set(email, "apoio");
  if (document.responsible) result.set(document.responsible, "responsável");
  return result;
}

/** Queue changes in the same transaction as the saved operation. */
export async function notifyOperationTeamChange(c: any, before: any, after: any, schedule: any) {
  const previous = roles(before.document), next = roles(after.document);
  const changed = [...new Set([...previous.keys(), ...next.keys()])]
    .filter(email => previous.get(email) !== next.get(email));
  if (!changed.length) return;
  const order = (await c.query(
    "SELECT COALESCE(numero_sequencia,id_m8)::text number,cliente_nome FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",
    [schedule.company_id, schedule.order_id],
  )).rows[0];
  const operation = String(after.position).padStart(2, "0");
  for (const recipient of changed) {
    const oldRole = previous.get(recipient), newRole = next.get(recipient);
    const title = !newRole ? "Operação retirada da sua programação"
      : !oldRole ? "Operação incluída na sua programação" : "Sua função na operação foi alterada";
    const detail = !newRole
      ? `Você foi retirado da operação, na qual atuava como ${oldRole}.`
      : !oldRole ? `Você foi incluído como ${newRole} desta operação.`
      : `Sua função passou de ${oldRole} para ${newRole}.`;
    await queueServiceMessage(c,
      `operation-team:${after.id}:${after.version}:${recipient}`,
      `📋 *${title}*\n*OS ${order?.number || schedule.order_id} · OP${operation} · ${companyName(schedule.company_id)}*\nCliente: ${order?.cliente_nome || "Não informado"}\nOperação: ${after.document.description || "Não informada"}\n${detail}\nData: ${after.document.date || "A confirmar"} ${after.document.time || ""}\n${!after.sent_at && newRole ? "A operação ainda aguarda envio ao Portal Técnico.\n" : ""}Confira sua programação: ${PUBLIC_SYSTEM_URL}/tecnico`,
      { recipient },
    );
  }
}
