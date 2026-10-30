import type { M8Client } from "../m8/client.js";
import { transaction, type Database } from "../database/postgres.js";
import { SafeError } from "../utils/logger.js";
import { contractSchedule } from "./contractSchedule.js";
import { catalogPages } from "./catalogPages.js";
export const commercialEndpoints = {
  fContratos: "/v1/contratos/contratoservico",
  fFaturamento: "/v1/faturamento/notafiscalvenda",
  fDevolucoesOutros: "/v1/faturamento/notafiscaloutra",
  fDevolucoesCompra: "/v1/compras/notafiscal",
} as const;
export type CommercialKind = keyof typeof commercialEndpoints;

export async function syncCommercialFacts(
  client: Pick<M8Client, "company" | "get">,
  db: Database,
  kind: CommercialKind,
  shouldStop?: () => boolean,
) {
  if (![1, 2, 27404].includes(client.company))
    throw new SafeError("Empresa fora do escopo comercial");
  // 81020/81021 belong to quotes/purchases; financial facts use a separate range.
  const lock = 81030 + Object.keys(commercialEndpoints).indexOf(kind);
  if (
    !(
      await db.query("SELECT pg_try_advisory_lock($1,$2) AS ok", [
        lock,
        client.company,
      ])
    ).rows[0]?.ok
  )
    throw new SafeError("Coleta comercial já em execução");
  try {
    const rows = await catalogPages(
      client,
      commercialEndpoints[kind],
      shouldStop,
    );
    if (kind === "fContratos") {
      for (const row of rows) {
        const path = `${commercialEndpoints.fContratos}/${row.id}`;
        const fixed = await catalogPages(client, `${path}/valorfixo`, shouldStop);
        const variable = await catalogPages(client, `${path}/valorvariavel`, shouldStop);
        row._billingSchedule = contractSchedule(row, fixed, variable);
      }
    }
    // A malformed response never becomes an empty snapshot. Valid empty lists are reconciled.
    await transaction(db, async () => {
      await db.query(
        "UPDATE m8_commercial_facts SET present=false WHERE company_id=$1 AND kind=$2",
        [client.company, kind],
      );
      for (let i = 0; i < rows.length; i += 500) {
        await db.query(
          `INSERT INTO m8_commercial_facts(company_id,kind,id,payload)
     SELECT $1,$2,(r->>'id')::bigint,r FROM jsonb_array_elements($3::jsonb) r
     ON CONFLICT(company_id,kind,id) DO UPDATE SET payload=EXCLUDED.payload,present=true,collected_at=now()`,
          [client.company, kind, JSON.stringify(rows.slice(i, i + 500))],
        );
      }
      await db.query(
        "INSERT INTO m8_commercial_facts_sync(company_id,kind) VALUES($1,$2) ON CONFLICT(company_id,kind) DO UPDATE SET collected_at=now()",
        [client.company, kind],
      );
    });
    return { company: client.company, kind, count: rows.length };
  } finally {
    await db.query("SELECT pg_advisory_unlock($1,$2)", [lock, client.company]);
  }
}
