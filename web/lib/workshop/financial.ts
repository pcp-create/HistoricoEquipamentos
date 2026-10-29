export type WorkshopFinancialOrder = {
  id: string;
  company: number;
  number: string;
  status: string;
  situation: string;
  amount: number | null;
};
export type WorkshopFinancialQuote = {
  id: string;
  company: number;
  number: string;
  status: string;
  amount: number | null;
};
export type WorkshopFinancialBucket = {
  total: number | null;
  missing: number;
  count: number;
};
export type WorkshopFinancial = {
  kind: "sale" | "cost";
  total: number | null;
  missing: number;
  unlinked: boolean;
  orders: WorkshopFinancialOrder[];
  breakdown?: {
    approved: WorkshopFinancialBucket;
    quotation: WorkshopFinancialBucket;
    cost: WorkshopFinancialBucket;
  };
  approvedOrders?: WorkshopFinancialOrder[];
  costOrders?: WorkshopFinancialOrder[];
  quotes?: WorkshopFinancialQuote[];
};
export const isOpenWorkshopQuote = (status: string) =>
  ["EmAndamento", "Processado", "Pendente", "Aprovado"].includes(status);
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function sumValues(
  rows: { amount: number | null }[],
  available = true,
): WorkshopFinancialBucket {
  let cents = 0,
    missing = 0;
  for (const row of rows) {
    const n =
        row.amount == null || String(row.amount).trim() === ""
          ? NaN
          : Number(row.amount),
      value = Math.round(n * 100);
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      !Number.isSafeInteger(value) ||
      !Number.isSafeInteger(cents + value)
    ) {
      row.amount = null;
      missing++;
      continue;
    }
    row.amount = value / 100;
    cents += value;
  }
  return {
    total: available && !missing ? cents / 100 : null,
    missing,
    count: rows.length,
  };
}
export function workshopFinancial(
  orders: WorkshopFinancialOrder[],
  rental: boolean,
  linked: boolean,
  quotes: WorkshopFinancialQuote[] = [],
): WorkshopFinancial {
  const group = (kind: string) => [
    ...new Map(
      orders
        .filter(
          (o) =>
            ["Pendente", "Aprovado"].includes(o.status) &&
            normalize(o.situation || "").includes(kind),
        )
        .map((o) => [`${o.company}:${o.id}`, { ...o }]),
    ).values(),
  ];
  const approvedOrders = group("cobranca"),
    costOrders = group("custo");
  const openQuotes = [
    ...new Map(
      quotes
        .filter((q) => isOpenWorkshopQuote(q.status))
        .map((q) => [`${q.company}:${q.id}`, { ...q }]),
    ).values(),
  ];
  const approved = sumValues(approvedOrders, linked),
    cost = sumValues(costOrders, linked),
    quotation = sumValues(openQuotes);
  const primary = rental ? cost : approved;
  return {
    kind: rental ? "cost" : "sale",
    total: primary.total,
    missing: primary.missing,
    unlinked: !linked,
    orders: rental ? costOrders : approvedOrders,
    approvedOrders,
    costOrders,
    quotes: openQuotes,
    breakdown: { approved, quotation, cost },
  };
}
export function financialDetailOrders(financial: WorkshopFinancial) {
  return [
    ...new Map(
      [
        ...(financial.approvedOrders || financial.orders),
        ...(financial.costOrders || []),
      ].map((o) => [`${o.company}:${o.id}`, o]),
    ).values(),
  ];
}

/** Both M8 links are explicit; UNION avoids counting a direct and extra link twice. */
export async function workshopFinancialOrders(db: any, equipmentIds: string[]) {
  if (!equipmentIds.length) return new Map<string, WorkshopFinancialOrder[]>();
  const rows = (
    await db.query(
      `WITH linked AS (
 SELECT produto_equipamento_id AS equipment_id,company_id,id_m8 AS order_id FROM m8_ordens_servico WHERE produto_equipamento_id=ANY($1::bigint[])
 UNION
 SELECT equipment_id,company_id,order_id FROM m8_order_equipment_links WHERE equipment_id=ANY($1::bigint[]) AND NOT stale
 ) SELECT l.equipment_id::text,o.id_m8::text id,o.company_id company,COALESCE(o.numero_sequencia,o.id_m8)::text number,o.status,o.situacao_nome situation,o.total_geral amount
 FROM linked l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id
 WHERE o.status IN ('Pendente','Aprovado') AND o.situacao_nome ILIKE ANY(ARRAY['%COBRAN%','%CUSTO%'])
 ORDER BY o.company_id,o.id_m8`,
      [equipmentIds],
    )
  ).rows;
  const grouped = new Map<string, WorkshopFinancialOrder[]>();
  for (const row of rows) {
    const key = String(row.equipment_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }
  return grouped;
}

export function customerWorkshopValue(visits: any[]) {
  const orders = new Map<string, WorkshopFinancialOrder>();
  let incomplete = 0;
  for (const visit of visits) {
    if (
      visit.exited_at ||
      visit.reconciled_out_at ||
      visit.rental ||
      visit.financial?.kind === "cost"
    )
      continue;
    if (!visit.financial || visit.financial.unlinked || visit.financial.missing)
      incomplete++;
    for (const order of visit.financial?.orders || [])
      orders.set(`${order.company}:${order.id}`, order);
  }
  const financial = workshopFinancial([...orders.values()], false, true);
  return {
    total:
      financial.orders.reduce(
        (sum, o) => sum + Math.round((o.amount ?? 0) * 100),
        0,
      ) / 100,
    incomplete,
    orders: financial.orders.length,
  };
}

export async function workshopOrderItems(
  db: any,
  orders: WorkshopFinancialOrder[],
) {
  if (!orders.length) return [];
  const keys = JSON.stringify(
    orders.map((o) => ({ company: o.company, id: o.id })),
  );
  const rows = (
    await db.query(
      `WITH selected AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(company integer,id bigint))
 SELECT 'product' kind,p.company_id company,p.ordem_servico_id::text order_id,p.id_m8::text id,p.produto_nome name,p.referencia_fabricante reference,p.quantidade quantity,p.unidade_nome unit,p.valor_unitario unit_price,p.valor_total amount,COALESCE(p.esta_excluido,false) excluded,p.aprovado approval
 FROM m8_os_produtos p JOIN selected o ON o.company=p.company_id AND o.id=p.ordem_servico_id
 UNION ALL
 SELECT 'service',s.company_id,s.ordem_servico_id::text,s.id_m8::text,s.servico_nome,NULL,s.quantidade,s.payload->>'unidadeNome',s.valor_unitario,s.valor_total,lower(COALESCE(s.payload->>'estaExcluido','false'))='true',NULL
 FROM m8_os_servicos s JOIN selected o ON o.company=s.company_id AND o.id=s.ordem_servico_id
 ORDER BY company,order_id,kind,id`,
      [keys],
    )
  ).rows;
  const sync = (
    await db.query(
      `SELECT s.company_id company,s.ordem_servico_id::text id,s.last_detail_at FROM integracao_m8_os_sync s JOIN jsonb_to_recordset($1::jsonb) AS o(company integer,id bigint) ON o.company=s.company_id AND o.id=s.ordem_servico_id`,
      [keys],
    )
  ).rows;
  return orders.map((order) => ({
    ...order,
    detailAt:
      sync.find((s: any) => s.company === order.company && s.id === order.id)
        ?.last_detail_at || null,
    products: rows.filter(
      (r: any) =>
        r.kind === "product" &&
        r.company === order.company &&
        r.order_id === order.id,
    ),
    services: rows.filter(
      (r: any) =>
        r.kind === "service" &&
        r.company === order.company &&
        r.order_id === order.id,
    ),
  }));
}
