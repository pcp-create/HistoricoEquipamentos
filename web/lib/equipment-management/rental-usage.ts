import "server-only";
import { database } from "../db";
import { approvedMaterialSql } from "../material-approval";
import type { RentalUsage } from "./planning";

export async function rentalUsage(ids: string[]) {
  const result = new Map<string, RentalUsage>();
  for (const id of ids) result.set(id, { intervals: [], incomplete: false });
  if (!ids.length) return result;
  const rows = (
    await database().query(
      `SELECT p.produto_id::text AS id,
    (COALESCE(o.data_abertura,o.emissao) AT TIME ZONE 'America/Sao_Paulo')::date::text AS start,
    (o.data_entrega_prevista AT TIME ZONE 'America/Sao_Paulo')::date::text AS finish,
    o.status, bool_or(${approvedMaterialSql("p")}) AS approved
    FROM m8_os_produtos p JOIN m8_ordens_servico o ON o.company_id=p.company_id AND o.id_m8=p.ordem_servico_id
    WHERE p.produto_id=ANY($1::bigint[]) AND p.esta_excluido IS NOT TRUE
    AND o.company_id IN(1,2,27404) AND o.tipo_id IN(8,45) AND o.status IN('Pendente','Processado')
    GROUP BY p.produto_id,o.company_id,o.id_m8`,
      [ids],
    )
  ).rows;
  for (const r of rows) {
    const usage = result.get(r.id)!;
    const active = r.status === "Pendente" && r.approved;
    const returned = r.status === "Processado" && !r.approved;
    if (!active && !returned) continue;
    if (!r.start || (returned && (!r.finish || r.finish < r.start))) {
      usage.incomplete = true;
      continue;
    }
    usage.intervals.push({ start: r.start, end: active ? null : r.finish });
  }
  return result;
}
