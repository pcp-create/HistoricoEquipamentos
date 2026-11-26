export const maxDuration = 60;
import { requireUser, sameOrigin, Unauthorized, Forbidden } from '@/lib/auth';
import { database } from '@/lib/db';
import { reserveInternalSerial } from '@/lib/equipment/internal-serial';
import { serialCandidates } from '@/lib/equipment/serial-search';
import { linkExistingEquipment, EquipmentRegistrationError } from '@/lib/workshop/equipment-registration';
import { registerMachine } from '@/lib/visits/machine-registration';
import { AdminInputError } from '@/lib/admin-store';
import { TaskInputError } from '@/lib/tasks/store';
import { M8RequestError } from '@/lib/service-orders/m8';
import { canEditProposalReview } from '@/lib/crm/review-access';
import { isReviewAdmin } from '@/lib/crm/review-admin';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function proposalCustomer(request: Request, actor: string) {
  const id = new URL(request.url).searchParams.get('proposal') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new EquipmentRegistrationError('Selecione uma proposta válida.');
  const row = (await database().query(`SELECT p.status,o.customer_id,o.lead_id,w.state,w.reviewer,w.review_requested_by,
    EXISTS(SELECT 1 FROM crm_order_links l WHERE l.proposal_id=p.id AND l.state NOT IN ('complete','validation_failed')) pending_order,
    EXISTS(SELECT 1 FROM crm_proposal_email_attempts a WHERE a.proposal_id=p.id AND a.state IN ('sending','uncertain')) pending_email
    FROM crm_proposals p JOIN crm_opportunities o ON o.id=p.opportunity_id
    LEFT JOIN crm_proposal_workflows w ON w.proposal_id=p.id WHERE p.id=$1`, [id])).rows[0];
  if (!row) throw new EquipmentRegistrationError('Proposta não encontrada.');
  if (['won','lost','cancelled','converting'].includes(row.status) || ['sent','reviewed'].includes(row.state) || (row.state === 'in_review' && !canEditProposalReview(row,actor) && !await isReviewAdmin(database(),actor)) || row.pending_order || row.pending_email) throw new EquipmentRegistrationError('Esta proposta não pode ser alterada neste momento.');
  const key = row.lead_id ? `lead:${row.lead_id}` : row.customer_id ? `m8:${row.customer_id}` : '';
  if (!key) throw new EquipmentRegistrationError('Selecione um cliente ou lead para a proposta.');
  return key;
}

function failure(error: unknown) {
  if (error instanceof Unauthorized) return json({ error: 'Entre novamente para continuar.' }, 401);
  if (error instanceof Forbidden) return json({ error: 'Acesso não permitido.' }, 403);
  if (error instanceof EquipmentRegistrationError || error instanceof AdminInputError || error instanceof TaskInputError || error instanceof M8RequestError) return json({ error: error.message }, 400);
  console.error('CRM_PROPOSAL_EQUIPMENT_FAILED', error);
  return json({ error: 'Não foi possível confirmar o cadastro. Consulte novamente antes de um novo envio.' }, 503);
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await proposalCustomer(request, user.email);
    const serial = new URL(request.url).searchParams.get('serial') || '';
    if (serial.length > 100) throw new EquipmentRegistrationError('Série inválida.');
    return json({ rows: await serialCandidates(serial) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Origem inválida.' }, 403);
  try {
    const user = await requireUser(), key = await proposalCustomer(request, user.email), text = await request.text();
    if (text.length > 12000) return json({ error: 'Dados excedem o limite.' }, 413);
    let input: any;
    try { input = JSON.parse(text); } catch { throw new EquipmentRegistrationError('Dados inválidos.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EquipmentRegistrationError('Dados inválidos.');
    if (input.action === 'reserve-internal-serial') return json(await reserveInternalSerial(input.reservationId, user.email));
    if (input.customerKey !== key) throw new EquipmentRegistrationError('O cliente ou lead não corresponde à proposta.');
    if (input.action === 'link-existing') return json(await linkExistingEquipment({ ...input, customerKey: key, source: 'visits' }, user.email));
    if (input.action) throw new EquipmentRegistrationError('Ação inválida.');
    return json(await registerMachine({ ...input, customerKey: key, ownership: 'customer', source: 'visits' }, user));
  } catch (error) { return failure(error); }
}
