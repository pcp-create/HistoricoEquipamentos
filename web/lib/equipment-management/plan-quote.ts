import { quoteHistory } from "../quotes/suggestions";
import { mergeQuoteItems } from "../quotes/merge-items";
import { planItemUnit } from "./plan-items";
import "server-only";
import { database } from "../db";
import { userDisplayName, type AuthUser } from "../user-display-name";
import { blankQuote, parseQuote, quoteTotals } from "../quotes/types";
import { EquipmentInputError, parsePlan } from "./planning";
import { EquipmentConflict } from "./store";
import { planCatalog } from "./plan-catalog";
import { planClients } from "./plan-clients";
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function createPlanQuote(input: any, user: AuthUser) {
  if (
    !input ||
    !uuid(input.planId) ||
    !uuid(input.requestId) ||
    typeof input.equipment !== "string" ||
    !/^[1-9]\d{0,17}$/.test(input.equipment) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    !["1", "2", "27404"].includes(input.company) ||
    typeof input.clientId !== "string" ||
    !/^\d{0,18}$/.test(input.clientId)
  )
    throw new EquipmentInputError(
      "Confira o plano, a empresa e o cliente do orçamento.",
    );
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const equipment = (
      await c.query(
        "SELECT equipment_id::text AS id,name,model,serial FROM m8_equipment_catalog WHERE equipment_id=$1 AND present FOR UPDATE",
        [input.equipment],
      )
    ).rows[0];
    if (!equipment)
      throw new EquipmentInputError("Equipamento não encontrado.");
    // Serialize generation and reuse the same request after a timeout/retry.
    const previous = (
      await c.query(
        `SELECT q.id,q.number::text,q.document->>'deletedAt' AS deleted_at FROM web_equipment_events e JOIN web_quotes q ON q.id::text=e.document->>'quoteId'
      WHERE e.equipment_id=$1 AND e.plan_id=$2 AND e.document->>'requestId'=$3`,
        [input.equipment, input.planId, input.requestId],
      )
    ).rows[0];
    if (previous) {
      if (previous.deleted_at)
        throw new EquipmentConflict(
          "O orçamento desta solicitação já foi excluído. Feche e abra novamente a opção Gerar orçamento para criar outro rascunho.",
        );
      await c.query("COMMIT");
      return previous;
    }
    const stored = (
      await c.query(
        "SELECT document,version FROM web_equipment_plans WHERE id=$1 AND equipment_id=$2 AND NOT archived FOR UPDATE",
        [input.planId, input.equipment],
      )
    ).rows[0];
    if (!stored)
      throw new EquipmentInputError("Plano não encontrado ou arquivado.");
    if (stored.version !== input.version)
      throw new EquipmentConflict(
        "O plano foi alterado. Reabra-o antes de gerar o orçamento.",
      );
    const plan = parsePlan(stored.document);
    const items = plan.items || [];
    if (!items.length)
      throw new EquipmentInputError(
        "Cadastre os materiais ou serviços do plano antes de gerar o orçamento.",
      );
    const clients = await planClients(c, equipment.id);
    const customer = clients.find((r) => r.id === input.clientId);
    if ((clients.length && !customer) || (input.clientId && !customer))
      throw new EquipmentInputError(
        "Selecione um cliente vinculado ao equipamento ou à locação atual.",
      );
    const catalog = await planCatalog(c, items, input.company);
    const history = await quoteHistory(
      new URLSearchParams({
        clientId: customer?.id || "",
        equipmentId: equipment.id,
        serial: equipment.serial || "",
      }),
      c,
    );
    const historicalItems = [...history.items.values()];
    const quote = parseQuote({
      ...blankQuote(),
      company: input.company,
      clientId: customer?.id || "",
      client: customer?.name || "",
      equipmentId: equipment.id,
      equipment: equipment.name,
      model: equipment.model || "",
      serial: equipment.serial || "",
      serviceType: plan.name,
      interval: [
        plan.hours ? `${plan.hours} horas` : "",
        plan.months ? `${plan.months} meses` : "",
      ]
        .filter(Boolean)
        .join(" / "),
      notes: `Origem: plano preventivo ${plan.name}.\n${plan.notes}`,
      responsible: userDisplayName(user),
      items: items.map((i) => {
        const r = catalog.get(`${i.kind}:${i.code}`)!;
        const referencePrice =
          /^\d+(\.\d+)?$/.test(r.price) && Number(r.price) <= 10000000
            ? Number(r.price).toFixed(2)
            : "";
        const base = {
          ...i,
          unit: planItemUnit(i, r.unit).unit,
          key: `${i.kind === "material" ? "p" : "s"}:1:${i.code}${i.kind === "material" ? ":" + planItemUnit(i, r.unit).unit.trim().toUpperCase() : ""}`,
          price: referencePrice,
          selected: true,
          source: "",
          referencePrice,
          minimumPrice: r.minimum,
          lastPrice: "",
          referenceAt: "",
        };
        const matched = mergeQuoteItems(
          [base],
          historicalItems,
          history.histories,
        );
        const last = matched.histories[base.key]?.rows[0];
        const lastPrice =
          last &&
          /^\d+(\.\d+)?$/.test(last.unitPrice) &&
          Number(last.unitPrice) <= 10000000
            ? Number(last.unitPrice).toFixed(2)
            : "";
        return {
          ...i,
          name: r.name,
          unit: planItemUnit(i, r.unit).unit,
          key: base.key,
          price: lastPrice || referencePrice,
          selected: true,
          source: `Plano preventivo: ${plan.name} · ${lastPrice ? "última venda do cliente/equipamento" : "sem venda compatível; preço do cadastro M8"}; conferir antes de enviar`,
          referencePrice,
          minimumPrice: r.minimum,
          lastPrice,
          referenceAt: last?.date || "",
        };
      }),
    });
    const totals = quoteTotals(quote.items);
    const saved = (
      await c.query(
        `INSERT INTO web_quotes(id,company_id,client_name,equipment,service_type,document,total_cents,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,number::text,version`,
        [
          input.requestId,
          Number(quote.company),
          quote.client,
          quote.equipment,
          quote.serviceType,
          JSON.stringify({ ...quote, pendingAmounts: totals.invalid > 0 }),
          totals.total,
          user.email,
        ],
      )
    ).rows[0];
    await c.query(
      `INSERT INTO web_equipment_events(equipment_id,plan_id,kind,document,created_by,display_name)
      VALUES($1,$2,'plan',$3,$4,$5)`,
      [
        equipment.id,
        input.planId,
        JSON.stringify({
          action: "quote",
          requestId: input.requestId,
          quoteId: saved.id,
          quoteNumber: saved.number,
          planName: plan.name,
          planVersion: stored.version,
          client: quote.client,
          items: quote.items,
        }),
        user.email,
        userDisplayName(user),
      ],
    );
    await c.query("COMMIT");
    return saved;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
