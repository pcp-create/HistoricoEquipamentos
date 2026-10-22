import "server-only";
import { database } from "../db";
import { m8Session } from "./m8";
// Field mapping mirrors src/database/schema.ts; kept inside the standalone web app.
import fields from "./detail-fields.json";

// Only completed local creations can use this bridge before the integrator imports them.
export async function createdOrderDetail(
  company: string,
  id: string,
  importedAt?: string | null,
) {
  if (!["1", "2", "27404"].includes(company) || !/^[1-9]\d{0,9}$/.test(id))
    return null;
  const found = await database().query(
    importedAt
      ? "SELECT 1 FROM service_order_edits WHERE company_id=$1 AND m8_id=$2 AND state='complete' AND updated_at>$3::timestamptz LIMIT 1"
      : "SELECT 1 FROM service_order_submissions WHERE company_id=$1 AND m8_id=$2 AND state='complete' UNION ALL SELECT 1 FROM service_order_edits WHERE company_id=$1 AND m8_id=$2 AND state='complete' LIMIT 1",
    importedAt ? [company, id, importedAt] : [company, id],
  );
  if (!found.rows.length) return null;
  const m8 = await m8Session(Number(company));
  const rows = await m8(
    "/v1/assistenciatecnica/ordemservicocompleta?Id=" +
      id +
      "&Page=1&PageSize=1",
  );
  if (!Array.isArray(rows) || rows.length !== 1 || String(rows[0]?.id) !== id)
    throw new Error("O M8 ainda não disponibilizou os detalhes da OS.");
  return createdDetail(rows[0], Number(company));
}
export function createdDetail(source: any, company: number) {
  const map = (table: string, row: any): Record<string, unknown> => {
    const columns = fields[table as keyof typeof fields];
    return {
      company_id: company,
      id_m8: String(row.id),
      ...Object.fromEntries(
        columns
          .filter(([, key]) => row[key] !== undefined)
          .map(([column, key]) => [column, row[key]]),
      ),
    };
  };
  return {
    order: map("m8_ordens_servico", source),
    materials: (source.produtos || []).map((r: any) =>
      map("m8_os_produtos", r),
    ),
    services: (source.servicos || []).map((r: any) => map("m8_os_servicos", r)),
    equipment: source.equipamentoProduto?.id
      ? [map("m8_equipamentos", source.equipamentoProduto)]
      : [],
    equipment_links: [],
    detail_at: new Date().toISOString(),
  };
}
