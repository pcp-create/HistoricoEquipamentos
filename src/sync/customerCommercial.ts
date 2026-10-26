import type { M8Client } from "../m8/client.js";
import { record, id } from "../m8/ordemServico.js";
import { transaction, type Database } from "../database/postgres.js";
import { SafeError, safeError } from "../utils/logger.js";
import { catalogPages } from "./catalogPages.js";

export async function syncCustomerCommercial(
  client: Pick<M8Client, "get" | "company">,
  db: Database,
  options: { maxPeople?: number; drainInitial?: boolean; shouldStop?: () => boolean } = {},
) {
  if (client.company !== 1)
    throw new SafeError("Clientes são compartilhados; usar empresa 1");
  if (
    !(await db.query("SELECT pg_try_advisory_lock(81018,1) AS ok")).rows[0]?.ok
  )
    throw new SafeError("Sincronização de clientes já está em execução");
  let checked = 0,
    failures = 0;
  try {
    const fresh = (
      await db.query(
        "SELECT 1 FROM m8_customer_commercial_sync WHERE catalog_at>now()-interval '1 hour'",
      )
    ).rows.length;
    if (!fresh) {
      const rows = await catalogPages(
        client,
        "/v1/configuracoes/cliente",
        options.shouldStop,
      );
      if (!rows.length)
        throw new SafeError(
          "Catálogo de clientes vazio; cadastro anterior preservado",
        );
      await transaction(db, async () => {
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = JSON.stringify(rows.slice(i, i + 500));
          await db.query(
            `INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload,collected_at)
       SELECT 1,(r->>'id')::bigint,coalesce(r->>'razaoSocial',''),coalesce(r->>'cpfCnpj',''),r,now() FROM jsonb_array_elements($1::jsonb) r
       ON CONFLICT(company_id,person_id) DO UPDATE SET name=EXCLUDED.name,document=EXCLUDED.document,payload=EXCLUDED.payload,collected_at=now()`,
            [chunk],
          );
          await db.query(
            `INSERT INTO m8_customer_commercial_queue(person_id) SELECT (r->>'id')::bigint FROM jsonb_array_elements($1::jsonb) r ON CONFLICT DO NOTHING`,
            [chunk],
          );
        }
        await db.query(
          "INSERT INTO m8_customer_commercial_sync(singleton,catalog_at) VALUES(true,now()) ON CONFLICT(singleton) DO UPDATE SET catalog_at=now()",
        );
      });
    }
    let initialOnly = false;
    do {
    const targets = (
      await db.query<{ person_id: string }>(
        `SELECT person_id::text FROM m8_customer_commercial_queue WHERE next_at<=now() AND (NOT $2::boolean OR (checked_at IS NULL AND error IS NULL)) ORDER BY (checked_at IS NULL) DESC,next_at,person_id LIMIT $1`,
        [options.maxPeople ?? 100, initialOnly],
      )
    ).rows;
    if (!targets.length) break;
    for (const { person_id: person } of targets) {
      if (options.shouldStop?.()) break;
      try {
        const response = await client.get(
          `/v1/configuracoes/cliente/${person}`,
          {},
        );
        // ClienteDetailResponseDto omits id; the requested path identifies the client.
        if (
          !record(response) ||
          !record(response.data) ||
          (response.data.id != null && id(response.data.id) !== person) ||
          typeof response.data.razaoSocial !== "string" ||
          (response.data.cpfCnpj != null &&
            typeof response.data.cpfCnpj !== "string") ||
          (response.errors != null &&
            (!Array.isArray(response.errors) || response.errors.length))
        )
          throw new SafeError("Detalhe de cliente inválido");
        const sellers = await catalogPages(
          client,
          `/v1/configuracoes/cliente/${person}/vendedor`,
          options.shouldStop,
        );
        await transaction(db, async () => {
          await db.query(
            `INSERT INTO m8_customer_commercial(person_id,detail,sellers) VALUES($1,$2,$3)
      ON CONFLICT(person_id) DO UPDATE SET detail=EXCLUDED.detail,sellers=EXCLUDED.sellers,synced_at=now()`,
            [person, JSON.stringify(response.data), JSON.stringify(sellers)],
          );
          await db.query(
            "UPDATE m8_customer_commercial_queue SET checked_at=now(),next_at=now()+interval '24 hours',error=NULL WHERE person_id=$1",
            [person],
          );
        });
        checked++;
      } catch (error) {
        failures++;
        await db.query(
          "UPDATE m8_customer_commercial_queue SET error=$2,next_at=now()+interval '15 minutes' WHERE person_id=$1",
          [person, safeError(error)],
        );
      }
    }
    initialOnly = true;
    } while (options.drainInitial && !options.shouldStop?.());
    return { checked, failures };
  } finally {
    await db.query("SELECT pg_advisory_unlock(81018,1)");
  }
}
