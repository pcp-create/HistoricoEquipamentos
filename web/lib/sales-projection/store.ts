import "server-only";
import { database } from "../db";
import { projection, type SourceRow } from "./model";
import { cityKey } from "../tasks/territories";
import { reconcileBilling } from "./billing";
import targets from "./targets.json";
export async function salesProjection(period: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
    throw new Error("Período inválido");
  const db = database();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const [facts, orders, sync, invoices] = await Promise.all([
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
  ]);
  const result = projection(facts.rows, orders.rows, period, today);
  // All invoice dates are needed: a complementary service invoice can be issued
  // in a different month. This diagnostic does not change the PBIX totals.
  const billing = reconcileBilling(orders.rows, invoices.rows);
  for (const detail of result.details)
    if (detail.kind.startsWith("sales")) {
      detail.billing = billing.get(`${detail.company}:${detail.id}`);
    }
  const [customerRows, territories] = await Promise.all([
    db.query(
      `SELECT DISTINCT ON(d.person_id) d.person_id::text AS id,d.payload->>'municipioNome' AS city,d.payload->>'ufSigla' AS uf,r.seller_user,u.display_name FROM m8_customer_directory d LEFT JOIN web_customer_registry r ON r.company_id=1 AND r.person_id=d.person_id LEFT JOIN web_user_access u ON u.email=r.seller_user WHERE d.company_id IN(1,2,27404) ORDER BY d.person_id,(d.company_id=1) DESC,d.collected_at DESC`,
    ),
    db.query(
      `SELECT t.city_key,t.uf,coalesce(u.display_name,t.seller,'') AS seller FROM web_task_territories t LEFT JOIN web_user_access u ON u.email=t.seller_user`,
    ),
  ]);
  const byCity = new Map(
    territories.rows.map((t) => [t.city_key + ":" + t.uf, t.seller]),
  );
  const sellers = new Map(
    customerRows.rows.map((c) => [
      c.id,
      c.seller_user
        ? c.display_name || "Vendedor sem nome"
        : byCity.get(cityKey(c.city || "") + ":" + c.uf) || "",
    ]),
  );
  for (const detail of result.details)
    if (detail.kind.startsWith("sales") && detail.fields)
      detail.fields.seller =
        sellers.get(String(detail.fields.customerId)) || "";
  const dates = sync.rows.map((r) => new Date(r.collected_at).getTime());
  return {
    ...result,
    period,
    target: (targets as Record<string, number>)[period] ?? null,
    updatedAt: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    complete: sync.rows.length === 12,
    targetSource: "Metas do PBIX",
    today,
  };
}
export type ProjectionData = Awaited<ReturnType<typeof salesProjection>>;
