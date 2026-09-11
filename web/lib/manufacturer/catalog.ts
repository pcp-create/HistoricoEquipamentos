import "server-only";
import { linkedSerial } from "../equipment";
import { database } from "../db";
import { intervalOptions, matchesInterval } from "./intervals";
import { currentProducts } from "../product-current";
import {
  fold,
  catalogSearchTerms,
  normalizeCode,
  normalizeSerial,
  variantMatch,
  type Variant,
} from "./rules";
export function manualFilters(params: URLSearchParams) {
  const text = (k: string, max = 160) =>
    (params.get(k) || "").trim().slice(0, max);
  const company = text("company");
  if (company && !["1", "2", "27404"].includes(company))
    throw new Error("Empresa inválida");
  const page = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw new Error("Página inválida");
  const q = text("q", 200);
  if (q.split(/\s+/).length > 12) throw new Error("Use até 12 palavras");
  const serial = text("serial", 60);
  if (serial && normalizeSerial(serial).length < 4)
    throw new Error("Informe pelo menos quatro caracteres da série");
  return {
    q,
    company,
    page,
    serial,
    model: text("model", 80),
    variant: text("variant", 64),
    review: text("review") === "1",
    interval: text("interval", 160),
  };
}
export type ManualFilters = ReturnType<typeof manualFilters>;
export async function manufacturerCatalog(
  f: ManualFilters,
  optionsOnly = false,
) {
  const db = database();
  const revision = (
    await db.query(
      "SELECT id,filename,imported_at,report FROM manufacturer_revisions WHERE active",
    )
  ).rows[0];
  if (!revision)
    return {
      revision: null,
      variants: [],
      intervals: [],
      rows: [],
      total: 0,
      page: 1,
      coverage: null,
      consumption: null,
    };
  const all = (
    await db.query<Variant>(
      "SELECT id,name,header,models,rules,issues FROM manufacturer_variants WHERE revision_id=$1 ORDER BY name",
      [revision.id],
    )
  ).rows;
  const terms = catalogSearchTerms(f.q, all);
  const seriesTerms = terms.filter((term) =>
    /^[A-Z]*\d{4,}$/.test(normalizeSerial(term)),
  );
  const matchingSeries = new Map(
    all.map((v) => [
      v.id,
      new Set(
        seriesTerms.filter(
          (term) => variantMatch(v, f.model, term) === "match",
        ),
      ),
    ]),
  );
  const candidates = all.map((v) => {
    const match = variantMatch(v, f.model, f.serial);
    return {
      ...v,
      match:
        match === "review" && !f.serial && matchingSeries.get(v.id)!.size
          ? ("match" as const)
          : match,
    };
  });
  const variants = candidates.filter(
    (v) => v.match !== "no" || v.id === f.variant,
  );
  const selected = f.variant
    ? variants.filter((v) => v.id === f.variant)
    : variants;

  const entries = (
    await db.query(
      `SELECT e.*,v.name AS variant_name FROM manufacturer_entries e JOIN manufacturer_variants v ON v.id=e.variant_id WHERE e.variant_id=ANY($1::text[]) ORDER BY v.name,e.row_number`,
      [selected.map((v) => v.id)],
    )
  ).rows;
  const intervals = intervalOptions(entries);
  if (optionsOnly)
    return {
      revision,
      variants,
      intervals,
      rows: [],
      total: 0,
      page: 1,
      consumption: null,
    };
  const filtered = entries.filter((e) => {
    const v = selected.find((v) => v.id === e.variant_id)!;
    const document = fold(
      [
        e.description,
        e.code_original,
        e.code,
        e.observation,
        e.section,
        e.interval_original,
        e.variant_name,
        ...v.header,
        ...v.models,
        ...v.rules.map((r) => `${r.model} ${r.serial}`),
      ].join(" "),
    );
    return (
      matchesInterval(e, f.interval) &&
      (!f.review || e.issues.length) &&
      terms.every(
        (term) =>
          document.includes(term) ||
          matchingSeries.get(v.id)!.has(term) ||
          (normalizeCode(term).length > 0 &&
            normalizeCode(e.code_original).includes(normalizeCode(term))),
      )
    );
  });
  const page = Math.min(f.page, Math.max(1, Math.ceil(filtered.length / 50))),
    rows = filtered.slice((page - 1) * 50, page * 50);
  const codes = [...new Set(rows.map((r) => r.code).filter(Boolean))];
  const products = (
    await db.query(
      `WITH matched AS (
 SELECT x.code,x.company_id,x.product_id,array_agg(DISTINCT x.field ORDER BY x.field) AS fields
 FROM manufacturer_product_codes x
 WHERE x.code=ANY($1::text[]) AND ($2::bigint IS NULL OR x.company_id=$2) AND x.company_id IN (1,2,27404)
 GROUP BY x.code,x.company_id,x.product_id
 ), identities AS (
 SELECT code,product_id,bool_or('referenciaFabricante'=ANY(fields)) AS genuine
 FROM matched GROUP BY code,product_id
 ), ranked AS (
 SELECT *,count(*) OVER(PARTITION BY code)::int AS match_total,
 row_number() OVER(PARTITION BY code ORDER BY genuine DESC,product_id) AS rank FROM identities
 )
 SELECT r.code,c.company_id,c.product_id::text,c.name,c.unit,c.payload->>'bloqueado' AS blocked,
 c.payload->>'referenciaFabricante' AS reference,c.payload->>'codigoSimilaridade' AS similarity,
 COALESCE(m.fields,ARRAY[]::text[]) AS fields,r.match_total
 FROM ranked r JOIN m8_product_catalog c ON c.product_id=r.product_id
 LEFT JOIN matched m ON m.code=r.code AND m.company_id=c.company_id AND m.product_id=c.product_id
 WHERE r.rank<=8 AND c.company_id IN (1,2,27404) AND ($2::bigint IS NULL OR c.company_id=$2)
 ORDER BY r.code,r.rank,c.company_id`,
      [codes, f.company || null],
    )
  ).rows;
  const current = await currentProducts(products);
  const enriched = products.map((p) => ({
    ...p,
    current: current.get(`${p.company_id}:${p.product_id}`),
  }));
  const consumption =
    f.company && f.serial
      ? await equipmentConsumption(f.company, f.serial)
      : null;
  return {
    revision,
    variants,
    intervals,
    rows: rows.map((r) => ({
      ...r,
      match: selected.find((v) => v.id === r.variant_id)!.match,
      products: enriched.filter((p) => p.code === r.code),
    })),
    total: filtered.length,
    page,
    consumption,
  };
}
export async function equipmentConsumption(company: string, serial: string) {
  const normalized = normalizeSerial(serial);
  // Exact normalized serial and company. EXISTS avoids duplicating an OS with multiple equipment rows.
  const where = `o.company_id=$1 AND (regexp_replace(upper(COALESCE(o.numero_serie,'')),'[^A-Z0-9]','','g')=$2 OR regexp_replace(upper(COALESCE(o.serie,'')),'[^A-Z0-9]','','g')=$2 OR EXISTS(SELECT 1 FROM m8_equipamentos e WHERE e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8 AND regexp_replace(upper(COALESCE(e.numero_serie,'')),'[^A-Z0-9]','','g')=$2) OR ${linkedSerial("$2")})`;
  const db = database();
  const coverage = (
    await db.query(
      `SELECT count(*)::int AS orders,count(*) FILTER(WHERE s.last_detail_at IS NOT NULL)::int AS imported,count(DISTINCT o.cliente_id)::int AS clients,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM m8_equipment_linked l WHERE l.company_id=o.company_id AND l.order_id=o.id_m8 AND l.method='observation'))::int AS inferred FROM m8_ordens_servico o LEFT JOIN integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8 WHERE ${where}`,
      [company, normalized],
    )
  ).rows[0];
  const rows = (
    await db.query(
      `SELECT p.produto_id::text AS product_id,p.unidade_nome AS unit,max(p.produto_nome) AS name,count(DISTINCT o.id_m8)::int AS orders,sum(p.quantidade)::text AS quantity,max(COALESCE(o.emissao,o.data_abertura)) AS last_used
 FROM m8_ordens_servico o JOIN m8_os_produtos p ON p.company_id=o.company_id AND p.ordem_servico_id=o.id_m8
 JOIN integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8
 WHERE ${where} AND o.status='Processado' AND s.finalized IS TRUE AND s.pending IS FALSE AND p.esta_excluido IS NOT TRUE AND p.quantidade>0 AND p.quantidade::text NOT IN ('NaN','Infinity','-Infinity')
 GROUP BY p.produto_id,p.unidade_nome ORDER BY max(COALESCE(o.emissao,o.data_abertura)) DESC NULLS LAST,p.produto_id LIMIT 101`,
      [company, normalized],
    )
  ).rows;
  return {
    ...coverage,
    truncated: rows.length > 100,
    rows: rows.slice(0, 100),
  };
}
