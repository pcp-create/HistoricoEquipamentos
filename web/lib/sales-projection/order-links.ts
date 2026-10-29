import "server-only";
import { database } from "../db";
import type { Detail } from "./model";

export async function attachLinkedOrders(sales: Detail[]) {
  if (!sales.length) return;
  const db = database();
  // Fetch linked order annotations in one batch, scoped by the original ERP company.
  const linkedOrders = await db.query<{
    company: string; id: string; linked_company: number; linked_id: string;
    number: string; order_type: string | null; flow_status: string | null;
  }>(`
    SELECT l.company_id::text company,l.order_id::text id,
      l.linked_company_id linked_company,l.linked_order_id::text linked_id,
      COALESCE(o.numero_sequencia,o.id_m8,l.linked_order_id)::text number,
      o.payload->>'tipoNome' order_type,
      COALESCE(o.status_lancamento_nome,o.payload->>'statusLancamentoNome') flow_status
    FROM web_order_links l
    JOIN jsonb_to_recordset($1::jsonb) k(company_id bigint,order_id bigint)
      ON k.company_id=l.company_id AND k.order_id=l.order_id
    LEFT JOIN m8_ordens_servico o
      ON o.company_id=l.linked_company_id AND o.id_m8=l.linked_order_id
    WHERE l.linked_order_id IS NOT NULL
  `, [JSON.stringify(sales.map(detail => ({
    company_id: Number(detail.fields?.sourceCompany || detail.company), order_id: detail.id,
  })))]);
  const linkedByOrder = new Map(linkedOrders.rows.map(row => [`${row.company}:${row.id}`, row]));
  for (const detail of sales) {
    const link = linkedByOrder.get(`${detail.fields?.sourceCompany || detail.company}:${detail.id}`);
    if (link) detail.linkedOrder = {
      company: Number(link.linked_company), id: link.linked_id, number: link.number,
      orderType: link.order_type || "", flowStatus: link.flow_status || "",
    };
  }
}
