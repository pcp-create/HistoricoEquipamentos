import { rentalContract } from "./contract";
import "server-only";
import { database } from "../db";
import { approvedMaterialSql } from "../material-approval";
export type RentalStatus = {
  key: string;
  label: string;
  order: string | null;
  company: number | null;
  customer: string | null;
  stockNote?: string;
  contract?: ReturnType<typeof rentalContract>;
};
export function resolveRentalStatus(
  orders: {
    id: string;
    company_id: number;
    status: string;
    tipo_id: string | number;
    cliente_nome?: string | null;
    contract_start?: string | null;
    contract_end?: string | null;
  }[],
  totalStock: number | null = null,
): RentalStatus {
  // Caller supplies newest first. Active commitments take precedence over completed orders.
  const isReview = (o: (typeof orders)[number]) => o.status === "Pendente" && [20, 21].includes(Number(o.tipo_id));
  const pending = orders.find((o) => o.status === "Pendente" && !isReview(o));
  if (pending) {
    const kind = Number(pending.tipo_id);
    return {
      key: kind === 8 ? "rented" : kind === 45 ? "loaned" : "reserved",
      label: kind === 8 ? "Locado" : kind === 45 ? "Emprestado" : "Reservado",
      order: pending.id,
      company: pending.company_id,
      customer: pending.cliente_nome?.trim() || null,
      ...(kind === 8 || kind === 45
        ? {
            contract: rentalContract(
              pending.contract_start ?? null,
              pending.contract_end ?? null,
            ),
          }
        : {}),
    };
  }
  const latest = orders[0];
  if (
    latest?.status === "Processado" &&
    [24, 34].includes(Number(latest.tipo_id)) &&
    totalStock === 0
  )
    return {
      key: "sold",
      label: "Vendido",
      order: latest.id,
      company: latest.company_id,
      customer: latest.cliente_nome?.trim() || null,
    };
  const knownStock = totalStock != null && Number.isFinite(totalStock);
  const unavailable = knownStock && totalStock <= 0;
  const review = orders.find(isReview);
  if (!unavailable && review) return {
    key: "in_review",
    label: "Em Revisão",
    order: review.id,
    company: review.company_id,
    customer: review.cliente_nome?.trim() || null,
  };
  const stockText = knownStock
    ? totalStock.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
    : "";
  return {
    key: unavailable ? "unavailable" : "available",
    label: unavailable ? "Indisponível" : "Disponível",
    stockNote: unavailable
      ? `Estoque total: ${stockText}. ${totalStock === 0 ? "Sem saldo em estoque." : "Saldo negativo; conferir e ajustar."}`
      : knownStock && totalStock > 1
        ? `Estoque total: ${stockText}. Saldo acima de 1; conferir e ajustar.`
        : undefined,
    order: null,
    company: null,
    customer: null,
  };
}
export async function rentalStatuses(ids: string[]) {
  const result = new Map<string, RentalStatus>();
  if (!ids.length) return result;
  const rows = (
    await database().query(
      `WITH links AS (
 SELECT p.produto_id AS equipment_id,p.company_id,p.ordem_servico_id AS order_id
 FROM m8_os_produtos p WHERE p.produto_id=ANY($1::bigint[])
 AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")}
 UNION
 SELECT l.equipment_id,l.company_id,l.order_id
 FROM m8_equipment_linked l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id
 WHERE l.equipment_id=ANY($1::bigint[]) AND o.status='Pendente' AND o.tipo_id IN(20,21)
 AND (NOT EXISTS(SELECT 1 FROM m8_os_produtos p WHERE p.company_id=l.company_id AND p.ordem_servico_id=l.order_id AND p.produto_id=l.equipment_id)
 OR EXISTS(SELECT 1 FROM m8_os_produtos p WHERE p.company_id=l.company_id AND p.ordem_servico_id=l.order_id AND p.produto_id=l.equipment_id AND p.esta_excluido IS NOT TRUE AND ${approvedMaterialSql("p")}))
 )
 SELECT DISTINCT l.equipment_id::text AS equipment_id,o.id_m8::text AS id,o.company_id,o.status,o.tipo_id,o.cliente_nome,
 (o.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date::text AS contract_start,
 (o.data_entrega AT TIME ZONE 'America/Sao_Paulo')::date::text AS contract_end,COALESCE(o.emissao,o.data_abertura) AS order_date
 FROM links l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id
 WHERE o.company_id IN(1,2,27404) AND o.status IN('Pendente','Processado')
 ORDER BY order_date DESC NULLS LAST,o.id_m8::text DESC,o.company_id DESC`,
      [ids],
    )
  ).rows;
  const stocks = (
    await database().query(
      `SELECT product_id::text AS id,
      CASE WHEN count(*)=count(stock) THEN sum(stock)::text END AS total
     FROM m8_product_stock WHERE product_id=ANY($1::bigint[])
     AND company_id IN(1,2,27404) GROUP BY product_id`,
      [ids],
    )
  ).rows;
  const totals = new Map<string, number | null>(
    stocks.map((s) => [s.id, s.total == null ? null : Number(s.total)]),
  );
  // Numeric ID breaks ties without lexicographic ordering (e.g. 99 versus 100).
  rows.sort((a, b) => {
    const ad = a.order_date ? new Date(a.order_date).getTime() : -Infinity,
      bd = b.order_date ? new Date(b.order_date).getTime() : -Infinity;
    if (ad !== bd) return bd - ad;
    return BigInt(a.id) === BigInt(b.id)
      ? b.company_id - a.company_id
      : BigInt(a.id) > BigInt(b.id)
        ? -1
        : 1;
  });
  for (const id of ids)
    result.set(
      id,
      resolveRentalStatus(
        rows.filter((r) => r.equipment_id === id),
        totals.get(id) ?? null,
      ),
    );
  return result;
}
