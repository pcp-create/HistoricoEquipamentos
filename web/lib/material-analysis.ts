import { currentProducts } from "./product-current";
import "server-only";
import { database } from "./db";
import {
  summarizeMaterials,
  type AnalysisFilters,
  type Consumption,
  type Coverage,
} from "./material-planning";
const date = "COALESCE(o.emissao,o.data_abertura)";
const ready =
  "o.status='Processado' AND s.finalized IS TRUE AND s.pending IS FALSE";
export function analysisQueries(filters: AnalysisFilters) {
  const values: unknown[] = [filters.from, filters.to];
  const company = filters.company
    ? "o.company_id=$3"
    : "o.company_id IN (1,2,27404)";
  if (filters.company) values.push(Number(filters.company));
  const period = `${date} >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND ${date} < (($2::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`;
  const scope = `${company} AND ${period}`;
  return {
    values,
    coverage: `SELECT o.company_id, count(*) FILTER(WHERE o.status='Processado' AND ${period})::int AS eligible,
 count(*) FILTER(WHERE ${ready} AND ${period})::int AS complete,
 count(*) FILTER(WHERE o.status='Processado' AND ${date} IS NULL)::int AS undated,
 COALESCE(sum((SELECT count(*) FROM public.m8_os_produtos p WHERE p.company_id=o.company_id AND p.ordem_servico_id=o.id_m8 AND p.esta_excluido IS NOT TRUE AND (p.quantidade IS NULL OR p.quantidade<=0 OR p.quantidade::text IN ('NaN','Infinity','-Infinity') OR p.produto_id IS NULL))) FILTER(WHERE ${ready} AND ${period}),0)::int AS ignored_items
 FROM public.m8_ordens_servico o LEFT JOIN public.integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8 WHERE ${company} AND ((${period}) OR ${date} IS NULL) GROUP BY o.company_id ORDER BY o.company_id`,
    consumption: `SELECT p.company_id,p.produto_id::text AS product_id,
 COALESCE(NULLIF(upper(trim(p.unidade_nome)),''),'(sem unidade)') AS unit_key,
 NULLIF(upper(trim(p.unidade_nome)),'') AS unit,
 (array_agg(COALESCE(p.produto_nome,'Material sem descrição') ORDER BY ${date} DESC,p.id_m8 DESC))[1] AS name,
 (array_agg(p.referencia_fabricante ORDER BY ${date} DESC,p.id_m8 DESC))[1] AS reference,
 sum(p.quantidade)::float8 AS quantity,count(DISTINCT o.id_m8)::int AS orders,
 count(DISTINCT (${date} AT TIME ZONE 'America/Sao_Paulo')::date)::int AS active_days,
 min((${date} AT TIME ZONE 'America/Sao_Paulo')::date)::text AS first_used,max((${date} AT TIME ZONE 'America/Sao_Paulo')::date)::text AS last_used
 FROM public.m8_os_produtos p JOIN public.m8_ordens_servico o ON o.company_id=p.company_id AND o.id_m8=p.ordem_servico_id
 JOIN public.integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8
 WHERE ${scope} AND ${ready} AND p.esta_excluido IS NOT TRUE AND p.quantidade>0 AND p.quantidade::text NOT IN ('NaN','Infinity','-Infinity') AND p.produto_id IS NOT NULL
 GROUP BY p.company_id,p.produto_id,NULLIF(upper(trim(p.unidade_nome)),''),COALESCE(NULLIF(upper(trim(p.unidade_nome)),''),'(sem unidade)') ORDER BY p.company_id,p.produto_id LIMIT 20001`,
  };
}
export async function materialAnalysis(
  filters: AnalysisFilters,
  exporting = false,
) {
  const db = await database().connect();
  try {
    // Both queries see the same import state while the runner writes in parallel.
    await db.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const sql = analysisQueries(filters);
    const c = await db.query<Coverage>(sql.coverage, sql.values);
    const r = await db.query<Consumption>(sql.consumption, sql.values);
    await db.query("COMMIT");
    if (r.rows.length > 20000)
      throw new Error(
        "Limite de 20.000 materiais. Reduza o período ou selecione uma empresa.",
      );
    const { planned, units, topFrequency, topQuantity } = summarizeMaterials(
      r.rows,
      c.rows,
      filters,
    );
    const page = Math.min(
      filters.page,
      Math.max(1, Math.ceil(planned.length / filters.size)),
    );
    const current = await currentProducts(
      exporting
        ? planned
        : planned.slice((page - 1) * filters.size, page * filters.size),
    );
    const enriched = planned.map((row) => ({
      ...row,
      current: current.get(`${row.company_id}:${row.product_id}`),
    }));
    return {
      filters,
      coverage: c.rows,
      units,
      topFrequency,
      topQuantity,
      total: planned.length,
      page,
      size: filters.size,
      rows: exporting
        ? enriched
        : enriched.slice((page - 1) * filters.size, page * filters.size),
      summary: {
        materials: planned.length,
        estimable: planned.filter((r) => r.minimum !== null).length,
        eligible: c.rows.reduce((n, r) => n + r.eligible, 0),
        complete: c.rows.reduce((n, r) => n + r.complete, 0),
      },
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
