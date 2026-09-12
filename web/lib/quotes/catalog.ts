import { approvedMaterialSql } from "../material-approval";
import "server-only";
import { quoteProducts } from "./products";
import { createHash } from "node:crypto";
import { database } from "../db";
import { fold, escapeLike } from "../filters";
import { sameUnit } from "../product-values";
import { QuoteValidation, type QuoteItem, type QuoteSale } from "./types";
const normalized = (sql: string) =>
  `translate(lower(COALESCE(${sql},'')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn')`;
const number = (v: unknown) =>
  v == null || !Number.isFinite(Number(v)) || Number(v) < 0
    ? ""
    : String(Number(v));
const date = (v: unknown) =>
  v instanceof Date ? v.toISOString() : String(v || "");
export async function quoteCatalog(p: URLSearchParams) {
  const kind = p.get("lookup") === "materials" ? "material" : "service";
  const page = Number(p.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw new QuoteValidation("Página inválida.");
  const pattern =
    "%" + escapeLike(fold((p.get("q") || "").trim().slice(0, 120))) + "%";
  const db = database();
  const catalog =
    kind === "material"
      ? `SELECT DISTINCT ON(product_id) product_id AS id,company_id,name,unit,sale_price,minimum_price,collected_at,
         concat_ws(' ',payload->>'codigoIdentificacaoInterno',payload->>'referenciaFabricante',payload->>'codigoSimilaridade') AS aliases
       FROM m8_product_catalog WHERE company_id IN(1,2,27404) ORDER BY product_id,company_id`
      : `SELECT DISTINCT ON(service_id) service_id AS id,company_id,name,unit,sale_price,minimum_price,collected_at,internal_code AS aliases
       FROM m8_service_catalog WHERE company_id IN(1,2,27404) ORDER BY service_id,company_id`;
  const rows = (
    await db.query(
      `WITH catalog AS (${catalog})
    SELECT * FROM catalog WHERE ${normalized("concat_ws(' ',name,id,aliases)")} LIKE $1
    ORDER BY name,id LIMIT 31 OFFSET $2`,
      [pattern, (page - 1) * 30],
    )
  ).rows;
  const choices = rows.slice(0, 30);
  const ids = choices.map((r) => String(r.id));
  const source =
    kind === "material"
      ? `SELECT p.produto_id AS id,p.company_id,p.ordem_servico_id,upper(trim(COALESCE(p.unidade_nome,''))) AS unit,p.quantidade AS quantity,p.valor_total AS total FROM m8_os_produtos p WHERE p.produto_id=ANY($1::bigint[]) AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")} AND p.quantidade>0`
      : `SELECT s.servico_id AS id,s.company_id,s.ordem_servico_id,'' AS unit,s.quantidade AS quantity,COALESCE(s.valor_total,s.valor_unitario*s.quantidade) AS total FROM m8_os_servicos s WHERE s.servico_id=ANY($1::bigint[]) AND s.quantidade>0`;
  const sales = ids.length
    ? (
        await db.query(
          `WITH lines AS (${source}), sales AS (
    SELECT l.id,l.unit,l.company_id,l.ordem_servico_id,COALESCE(o.emissao,o.data_abertura) AS used_at,
      COALESCE(o.numero_sequencia,o.id_m8) AS order_number,o.cliente_nome AS customer,sum(l.quantity) AS quantity,
      CASE WHEN count(l.total)=count(*) THEN sum(l.total) END AS total
    FROM lines l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.ordem_servico_id
    JOIN integracao_m8_os_sync sync ON sync.company_id=o.company_id AND sync.ordem_servico_id=o.id_m8
    WHERE o.company_id IN(1,2,27404) AND o.status='Processado' AND sync.finalized AND NOT sync.pending
    GROUP BY l.id,l.unit,l.company_id,l.ordem_servico_id,o.emissao,o.data_abertura,o.cliente_nome,o.numero_sequencia,o.id_m8
  ) SELECT DISTINCT ON(id,unit) *,total/quantity AS unit_price FROM sales
    ORDER BY id,unit,used_at DESC NULLS LAST,ordem_servico_id DESC,company_id`,
          [ids],
        )
      ).rows
    : [];
  const items: QuoteItem[] = choices.map((r) => {
    const unit = r.unit || "";
    const sale = sales.find(
      (s) =>
        String(s.id) === String(r.id) &&
        (kind === "service" || sameUnit(s.unit, unit)),
    );
    const generalSale: QuoteSale | undefined = sale
      ? {
          company: String(sale.company_id),
          order: String(sale.ordem_servico_id),
          orderNumber: String(sale.order_number),
          date: date(sale.used_at),
          quantity: String(sale.quantity),
          unitPrice: number(sale.unit_price),
          total: number(sale.total),
          customer: sale.customer || "",
        }
      : undefined;
    const key =
      kind === "material"
        ? `p:1:${r.id}:${unit.trim().toUpperCase()}`
        : `s:1:${r.id}`;
    return {
      key:
        key.length > 200
          ? kind + ":" + createHash("sha256").update(key).digest("hex")
          : key,
      kind,
      code: String(r.id),
      name: r.name,
      unit,
      quantity: "1",
      price: "",
      selected: false,
      source: `Base geral · Cadastro M8 empresa ${r.company_id} · ${r.aliases || ""} · Última venda entre todas as empresas, clientes e equipamentos`,
      referencePrice: number(r.sale_price),
      minimumPrice: number(r.minimum_price),
      lastPrice: generalSale?.unitPrice || "",
      referenceAt: date(r.collected_at),
      ...(generalSale ? { generalSale } : {}),
    };
  });
  return {
    items: await quoteProducts(items),
    page,
    truncated: rows.length > 30,
  };
}
