import type { M8Client } from "../m8/client.js";
import { listData, uniqueRows } from "../m8/collections.js";
import { id } from "../m8/ordemServico.js";
import { transaction, type Database } from "../database/postgres.js";
import { SafeError, log, safeError } from "../utils/logger.js";
const positive = (value: unknown) => {
  const result = id(value);
  if (result === "0") throw new SafeError("Localidade retornou ID inválido");
  return result;
};
const text = (value: unknown) => (value == null ? null : String(value));
export async function fetchCustomerLocalities(
  client: Pick<M8Client, "get">,
  person: string,
) {
  positive(person);
  const rows: Record<string, unknown>[] = [],
    seen = new Set<string>();
  // Documented pagination; never reconcile a partial snapshot or an ignored page filter.
  for (let page = 1; page <= 100; page++) {
    const batch = listData(
      await client.get(`/v1/configuracoes/cliente/${person}/endereco`, {
        Page: page,
        PageSize: 100,
      }),
    );
    for (const row of batch) {
      const address = positive(row.id);
      if (positive(row.pessoaId) !== person)
        throw new SafeError(
          "Localidade pertence a outro cliente; cadastro anterior preservado",
        );
      if (seen.has(address))
        throw new SafeError(
          "Endereço repetido entre páginas; cadastro anterior preservado",
        );
      seen.add(address);
    }
    rows.push(...batch);
    if (batch.length < 100)
      return uniqueRows(rows).map((row) => ({
        address_id: positive(row.id),
        address_type: text(row.tipoEndereco),
        postal_code: text(row.cep),
        street: text(row.logradouro),
        number: text(row.numero),
        complement: text(row.complemento),
        letter: text(row.letra),
        district_id: row.bairroId == null ? null : id(row.bairroId),
        district: text(row.bairroNome),
        city_id: row.municipioId == null ? null : id(row.municipioId),
        city: text(row.municipioNome),
        state: text(row.estadoUFNome),
        country: text(row.paisNome),
        payload: row,
      }));
  }
  throw new SafeError(
    "Localidades excederam limite de páginas; cadastro anterior preservado",
  );
}
export async function syncCustomerLocalities(
  client: Pick<M8Client, "get" | "company">,
  db: Database,
  options: { maxPeople?: number; shouldStop?: () => boolean } = {},
) {
  const company = client.company;
  if (company !== 1)
    throw new SafeError(
      "Localidades compartilhadas devem ser consultadas somente pela empresa 1",
    );
  if (
    !(await db.query("SELECT pg_try_advisory_lock(81017,$1) AS ok", [company]))
      .rows[0]?.ok
  )
    throw new SafeError(
      "Coleta de localidades já está em execução nesta empresa",
    );
  let checked = 0,
    failures = 0;
  try {
    const targets = (
      await db.query<{ person_id: string }>(
        `SELECT person_id::text FROM m8_customer_locality_queue
      WHERE company_id=$1 AND next_at<=now() ORDER BY next_at,person_id LIMIT $2`,
        [company, options.maxPeople ?? 100],
      )
    ).rows;
    for (const target of targets) {
      if (options.shouldStop?.()) break;
      const person = target.person_id;
      await db.query(
        "UPDATE m8_customer_locality_queue SET attempted_at=now() WHERE company_id=$1 AND person_id=$2",
        [company, person],
      );
      try {
        const rows = await fetchCustomerLocalities(client, person);
        await transaction(db, async () => {
          await db.query(
            "UPDATE m8_customer_localities SET present=false WHERE company_id=$1 AND person_id=$2",
            [company, person],
          );
          await db.query(
            `INSERT INTO m8_customer_localities(company_id,person_id,address_id,address_type,postal_code,street,number,complement,letter,district_id,district,city_id,city,state,country,payload)
           SELECT $1,$2,r.address_id,r.address_type,r.postal_code,r.street,r.number,r.complement,r.letter,r.district_id,r.district,r.city_id,r.city,r.state,r.country,r.payload
           FROM jsonb_to_recordset($3::jsonb) AS r(address_id bigint,address_type text,postal_code text,street text,number text,complement text,letter text,district_id bigint,district text,city_id bigint,city text,state text,country text,payload jsonb)
           ON CONFLICT(company_id,person_id,address_id) DO UPDATE SET address_type=EXCLUDED.address_type,postal_code=EXCLUDED.postal_code,street=EXCLUDED.street,number=EXCLUDED.number,complement=EXCLUDED.complement,letter=EXCLUDED.letter,district_id=EXCLUDED.district_id,district=EXCLUDED.district,city_id=EXCLUDED.city_id,city=EXCLUDED.city,state=EXCLUDED.state,country=EXCLUDED.country,payload=EXCLUDED.payload,present=true,collected_at=now()`,
            [company, person, JSON.stringify(rows)],
          );
          await db.query(
            "UPDATE m8_customer_locality_queue SET checked_at=now(),next_at=now()+interval '24 hours',error=NULL WHERE company_id=$1 AND person_id=$2",
            [company, person],
          );
        });
        checked++;
      } catch (error) {
        failures++;
        await db.query(
          "UPDATE m8_customer_locality_queue SET error=$3,next_at=now()+interval '1 hour' WHERE company_id=$1 AND person_id=$2",
          [company, person, safeError(error)],
        );
      }
    }
    log("LOCALIDADES", "Coleta de endereços dos clientes concluída", {
      company,
      checked,
      failures,
    });
    return { checked, failures };
  } finally {
    await db.query("SELECT pg_advisory_unlock(81017,$1)", [company]);
  }
}
