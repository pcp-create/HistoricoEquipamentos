import { currentProducts } from "./product-current";
import "server-only";
import { database } from "./db";
import { escapeLike, fold, type Filters } from "./filters";

const normalized = (sql: string) =>
  `translate(lower(COALESCE(${sql},'')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn')`;
const equipmentLink =
  "e.company_id=o.company_id AND e.ordem_servico_id=o.id_m8";
const productLink = "p.company_id=o.company_id AND p.ordem_servico_id=o.id_m8";
const dateColumn = "COALESCE(o.emissao,o.data_abertura)";

export function buildWhere(filters: Filters) {
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const clauses = ["o.company_id IN (1,2,27404)"];
  const like = (column: string, input: string) =>
    `${normalized(column)} LIKE ${bind(`%${escapeLike(fold(input))}%`)}`;
  if (filters.company)
    clauses.push(`o.company_id=${bind(Number(filters.company))}`);
  if (filters.orderNumber)
    clauses.push(
      `COALESCE(o.numero_sequencia,o.id_m8)=${bind(filters.orderNumber)}`,
    );
  if (filters.status) clauses.push(`o.status=${bind(filters.status)}`);
  if (filters.from)
    clauses.push(
      `${dateColumn} >= (${bind(filters.from)}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
    );
  if (filters.to)
    clauses.push(
      `${dateColumn} < ((${bind(filters.to)}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
    );
  if (filters.client)
    clauses.push(
      like(
        "concat_ws(' ',o.cliente_nome,o.cliente_razao_social,o.cliente_cpf_cnpj,o.cliente_id)",
        filters.client,
      ),
    );
  if (filters.equipment)
    clauses.push(
      like(
        "concat_ws(' ',o.equipamento,o.produto_equipamento_id)",
        filters.equipment,
      ),
    );
  if (filters.model)
    clauses.push(
      `(${like("o.modelo_equipamento", filters.model)} OR EXISTS (SELECT 1 FROM public.m8_equipamentos e WHERE ${equipmentLink} AND ${like("e.equipamento_modelo", filters.model)}))`,
    );
  if (filters.exactSerial) {
    const serial = bind(filters.exactSerial);
    const exact = (column: string) =>
      `regexp_replace(upper(COALESCE(${column},'')),'[^A-Z0-9]','','g')=${serial}`;
    clauses.push(
      `(${exact("o.numero_serie")} OR ${exact("o.serie")} OR EXISTS (SELECT 1 FROM public.m8_equipamentos e WHERE ${equipmentLink} AND ${exact("e.numero_serie")}))`,
    );
  }
  if (filters.serial)
    clauses.push(
      `(${like("concat_ws(' ',o.numero_serie,o.serie)", filters.serial)} OR EXISTS (SELECT 1 FROM public.m8_equipamentos e WHERE ${equipmentLink} AND ${like("e.numero_serie", filters.serial)}))`,
    );
  if (filters.product) {
    const match = like(
      "concat_ws(' ',p.produto_nome,p.produto_id,p.referencia_fabricante,p.codigo_similaridade)",
      filters.product,
    );
    clauses.push(
      filters.view === "materials"
        ? match
        : `EXISTS (SELECT 1 FROM public.m8_os_produtos p WHERE ${productLink} AND ${match})`,
    );
  }
  if (filters.productId) {
    const match = `p.produto_id=${bind(filters.productId)}`;
    clauses.push(
      filters.view === "materials"
        ? match
        : `EXISTS (SELECT 1 FROM public.m8_os_produtos p WHERE ${productLink} AND ${match})`,
    );
  }
  for (const term of filters.q.split(/\s+/).filter(Boolean)) {
    const match = bind(`%${escapeLike(fold(term))}%`);
    clauses.push(`EXISTS (SELECT 1 FROM public.web_history_search search WHERE search.company_id=o.company_id AND search.ordem_servico_id=o.id_m8 AND search.document LIKE ${match}
      ${filters.view === "materials" ? "AND (search.kind IN ('order','equipment') OR (search.kind='product' AND search.id_m8=p.id_m8))" : ""})`);
  }
  return { sql: clauses.join(" AND "), values };
}

export async function history(filters: Filters, exporting = false) {
  const db = database();
  const { sql, values } = buildWhere(filters);
  const from = `FROM public.m8_ordens_servico o ${filters.view === "materials" ? `JOIN public.m8_os_produtos p ON ${productLink}` : ""}`;
  const count = await db.query(
    `SELECT count(*)::int AS total ${from} WHERE ${sql}`,
    values,
  );
  const total: number = count.rows[0].total;
  if (exporting && total > 20000) throw new Error("EXPORT_LIMIT");
  const size = exporting ? 20000 : filters.size;
  const page = exporting
    ? 1
    : Math.min(filters.page, Math.max(1, Math.ceil(total / size)));
  const rows = await db.query(
    `SELECT o.company_id, o.id_m8::text AS id, COALESCE(o.numero_sequencia,o.id_m8)::text AS number,
    ${dateColumn} AS date, o.cliente_nome AS client, o.cliente_cpf_cnpj AS document,
    o.equipamento AS equipment, COALESCE(NULLIF(o.modelo_equipamento,''),eq.models) AS model,
    COALESCE(NULLIF(o.numero_serie,''),NULLIF(o.serie,''),eq.serials) AS serial,
    o.status, o.situacao_nome AS situation, s.last_detail_at AS detail_at,
    ${filters.view === "materials" ? `p.id_m8::text AS item_id, p.produto_nome AS material, p.referencia_fabricante AS reference, p.produto_id::text AS product_id, p.quantidade AS quantity, p.unidade_nome AS unit, p.valor_total AS amount, COALESCE(p.esta_excluido,false) AS is_excluded, CASE WHEN p.esta_excluido IS TRUE THEN 'Excluído da OS' ELSE 'Ativo' END AS item_status` : `o.total_geral AS amount, (SELECT count(*)::int FROM public.m8_os_produtos p WHERE ${productLink}) AS materials, (SELECT count(*)::int FROM public.m8_os_produtos p WHERE ${productLink} AND p.esta_excluido IS TRUE) AS excluded_materials`}
    ${from}
    LEFT JOIN public.integracao_m8_os_sync s ON s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8
    LEFT JOIN LATERAL (SELECT string_agg(DISTINCT NULLIF(e.numero_serie,''),', ') AS serials, string_agg(DISTINCT NULLIF(e.equipamento_modelo,''),', ') AS models FROM public.m8_equipamentos e WHERE ${equipmentLink}) eq ON true
    WHERE ${sql} ORDER BY ${dateColumn} DESC NULLS LAST, o.company_id, o.id_m8 DESC ${filters.view === "materials" ? ", p.id_m8" : ""}
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, size, (page - 1) * size],
  );
  const current =
    filters.view === "materials" ? await currentProducts(rows.rows) : new Map();
  return {
    rows: rows.rows.map((row) => ({
      ...row,
      current: current.get(`${row.company_id}:${row.product_id}`),
    })),
    total,
    page,
    size,
    view: filters.view,
  };
}

export async function overview() {
  const response = await database().query(`SELECT
    (SELECT count(*)::int FROM public.m8_ordens_servico WHERE company_id IN (1,2,27404)) AS orders,
    (SELECT count(*)::int FROM public.m8_os_produtos WHERE company_id IN (1,2,27404) AND esta_excluido IS NOT TRUE) AS materials,
    (SELECT count(DISTINCT cliente_id)::int FROM public.m8_ordens_servico WHERE company_id IN (1,2,27404)) AS clients,
    count(*) FILTER (WHERE last_detail_at IS NOT NULL)::int AS imported,
    max(last_detail_at) AS updated,
    (SELECT array_agg(DISTINCT status ORDER BY status) FILTER (WHERE status IS NOT NULL) FROM public.m8_ordens_servico WHERE company_id IN (1,2,27404)) AS statuses
    FROM public.integracao_m8_os_sync WHERE company_id IN (1,2,27404)`);
  return response.rows[0];
}

export async function orderDetail(company: string, id: string) {
  if (!["1", "2", "27404"].includes(company) || !/^[1-9]\d{0,17}$/.test(id))
    return null;
  const result = await database().query(
    `SELECT to_jsonb(o)-'payload' AS "order",
    (SELECT COALESCE(jsonb_agg(to_jsonb(p)-'payload' ORDER BY p.id_m8),'[]'::jsonb) FROM public.m8_os_produtos p WHERE ${productLink}) AS materials,
    (SELECT COALESCE(jsonb_agg(to_jsonb(s)-'payload' ORDER BY s.id_m8),'[]'::jsonb) FROM public.m8_os_servicos s WHERE s.company_id=o.company_id AND s.ordem_servico_id=o.id_m8) AS services,
    (SELECT COALESCE(jsonb_agg(to_jsonb(e)-'payload' ORDER BY e.id_m8),'[]'::jsonb) FROM public.m8_equipamentos e WHERE ${equipmentLink}) AS equipment,
    (SELECT last_detail_at FROM public.integracao_m8_os_sync WHERE company_id=o.company_id AND ordem_servico_id=o.id_m8) AS detail_at
    FROM public.m8_ordens_servico o WHERE o.company_id=$1 AND o.id_m8=$2`,
    [company, id],
  );
  const detail = result.rows[0];
  if (!detail) return null;
  const current = await currentProducts(
    detail.materials.map((p: { produto_id: string }) => ({
      company_id: Number(company),
      product_id: p.produto_id,
    })),
  );
  detail.materials = detail.materials.map((p: { produto_id: string }) => ({
    ...p,
    current: current.get(`${company}:${p.produto_id}`),
  }));
  return detail;
}
