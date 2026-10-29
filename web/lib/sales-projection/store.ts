import "server-only";
import { attachLinkedOrders } from "./order-links";
import { historyScheduleStatuses } from "../service-scheduling/history-status";
import { database } from "../db";
import { projection, type SourceRow } from "./model";
import { reconcileBilling, type BillingLink } from "./billing";
import targets from "./targets.json";
export async function salesProjection(period: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
    throw new Error("Período inválido");
  const db = database();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const [facts, orders, sync, invoices, headers, links] = await Promise.all([
    db.query<SourceRow>(
      `SELECT company_id,kind,id::text,payload FROM m8_commercial_facts WHERE present AND company_id IN(1,2,27404) AND (kind='fContratos' OR left(payload->>'emissao',7)=$1)`,
      [period],
    ),
    db.query<SourceRow>(
      `SELECT DISTINCT ON(id_m8) id_m8::text AS id,company_id,payload FROM m8_ordens_servico WHERE company_id IN(1,2,27404) ORDER BY id_m8,data_atualizacao DESC NULLS LAST,company_id`,
    ),
    db.query(
      `SELECT company_id,kind,collected_at FROM m8_commercial_facts_sync WHERE company_id IN(1,2,27404)`,
    ),
    db.query<SourceRow>(
      `SELECT company_id,kind,id::text,jsonb_build_object('empresaId',payload->'empresaId','pessoaId',payload->'pessoaId','observacao',payload->'observacao','totalGeral',payload->'totalGeral','status',payload->'status','estaExcluido',payload->'estaExcluido','emissao',payload->'emissao','documento',payload->'documento','documentoNfe',payload->'documentoNfe') AS payload FROM m8_commercial_facts WHERE present AND kind='fFaturamento' AND company_id IN(1,2,27404)`,
    ),
    db.query("SELECT company_id,collected_at FROM integracao_m8_headers_sync WHERE company_id IN(1,2,27404)").catch((e) => {
      if (e.code === "42P01") return {rows:[]};
      throw e;
    }),
    db.query<BillingLink>(
      `SELECT company_id,ordem_servico_id::text,documento_fiscal_id::text FROM m8_os_documentos_fiscais WHERE company_id IN(1,2,27404)`,
    ),
  ]);
  const result = projection(facts.rows, orders.rows, period, today);
  // All invoice dates are needed: a complementary service invoice can be issued
  // in a different month. This diagnostic does not change the PBIX totals.
  const billing = reconcileBilling(orders.rows, invoices.rows, links.rows);
  for (const detail of result.details)
    if (detail.kind.startsWith("sales")) {
      detail.billing = billing.get(`${detail.company}:${detail.id}`);
    }
  // Keep fields.seller from the OS payload (funcionarioNome), as mapped by
  // projection(). Customer assignments and territory rules can differ from the OS.
  const sales = result.details.filter((detail) => detail.kind.startsWith("sales"));
  const schedules = await historyScheduleStatuses(sales.map((detail) => ({
    company_id: Number(detail.fields?.sourceCompany || detail.company),
    id: detail.id,
    status: String(detail.fields?.status || ""),
  })));
  for (const detail of sales) {
    detail.programming = schedules.get(`${detail.fields?.sourceCompany || detail.company}:${detail.id}`);
  }
  // Same active visit and explicit equipment links used by the Workshop panel.
  const workshopOrders = await db.query<{ company: string; id: string }>(`
    SELECT DISTINCT o.company_id::text company, o.id_m8::text id
    FROM m8_ordens_servico o
    JOIN jsonb_to_recordset($1::jsonb) k(company_id bigint, order_id bigint)
      ON k.company_id=o.company_id AND k.order_id=o.id_m8
    WHERE EXISTS (
      SELECT 1 FROM web_workshop_visits v
      WHERE v.exited_at IS NULL AND v.reconciled_out_at IS NULL
        AND (v.equipment_id=o.produto_equipamento_id OR EXISTS (
          SELECT 1 FROM m8_order_equipment_links l
          WHERE l.company_id=o.company_id AND l.order_id=o.id_m8
            AND l.equipment_id=v.equipment_id AND NOT l.stale
        ))
    )`, [JSON.stringify(sales.map((detail) => ({
      company_id: Number(detail.fields?.sourceCompany || detail.company), order_id: detail.id,
    })))]);
  const inWorkshop = new Set(workshopOrders.rows.map((row) => `${row.company}:${row.id}`));
  for (const detail of sales) {
    if (detail.fields) detail.fields.inWorkshop =
      inWorkshop.has(`${detail.fields.sourceCompany || detail.company}:${detail.id}`) ? "Sim" : "Não";
  }
  await attachLinkedOrders(sales);
  const dates = sync.rows.map((r) => new Date(r.collected_at).getTime());
  return {
    ...result,
    period,
    target: (targets as Record<string, number>)[period] ?? null,
    ordersUpdatedAt: headers.rows.length === 3 ? new Date(Math.min(...headers.rows.map((r:any) => new Date(r.collected_at).getTime()))).toISOString() : null,
    updatedAt: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    complete: sync.rows.length === 12,
    targetSource: "Metas do PBIX",
    today,
  };
}
export type ProjectionData = Awaited<ReturnType<typeof salesProjection>>;
