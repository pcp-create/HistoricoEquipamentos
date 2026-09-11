import type { M8Client } from "../m8/client.js";
import { listData, uniqueRows } from "../m8/collections.js";
import { id } from "../m8/ordemServico.js";
import { transaction, type Database } from "../database/postgres.js";
import { SafeError, log, safeError } from "../utils/logger.js";
import { identity } from "../equipment/rules.js";
import { rebuildEquipmentLinks } from "../equipment/linker.js";
const positiveId = (v: unknown) => {
  const key = id(v);
  if (key === "0")
    throw new SafeError("ID de equipamento ou pessoa deve ser positivo");
  return key;
};
const text = (v: unknown) => (v == null ? null : String(v));
export function equipmentRows(body: unknown) {
  return uniqueRows(listData(body)).map((row) => ({
    equipment_id: positiveId(row.id),
    name: text(row.nome) || "Equipamento sem descrição",
    alias: text(row.apelido),
    brand: text(row.marcaNome),
    blocked: text(row.bloqueado),
    ...identity(row),
    payload: row,
  }));
}
export function personRows(body: unknown, person?: string) {
  return uniqueRows(listData(body)).map((row) => {
    const personId = positiveId(row.pessoaId);
    if (person && personId !== person)
      throw new SafeError(
        "Vínculo retornado pertence a outra pessoa; preservar cadastro anterior",
      );
    return {
      link_id: positiveId(row.id),
      person_id: personId,
      equipment_id: positiveId(row.equipamentoId),
      person_name: text(row.pessoaNome),
      equipment_name: text(row.equipamentoNome),
      payload: row,
    };
  });
}
export async function collectEquipmentCatalog(
  client: Pick<M8Client, "company" | "get">,
  db: Database,
) {
  if (client.company !== 1)
    throw new SafeError(
      "O cadastro compartilhado deve ser consultado pela empresa 1",
    );
  const rows = equipmentRows(
    await client.get("/v1/estoque/equipamento", { Page: 0, PageSize: 0 }),
  );
  if (!rows.length)
    throw new SafeError(
      "Cadastro de equipamentos vazio; carga anterior preservada",
    );
  await transaction(db, async () => {
    await db.query("SELECT pg_advisory_xact_lock(81014,0)");
    for (let n = 0; n < rows.length; n += 500)
      await db.query(
        `INSERT INTO m8_equipment_catalog(company_id,equipment_id,name,alias,brand,blocked,model,models,serial,serial_source,issues,payload,collected_at,present)
   SELECT 1,r.equipment_id,r.name,r.alias,r.brand,r.blocked,r.model,r.models,r.serial,r.serial_source,r.issues,r.payload,now(),true
   FROM jsonb_to_recordset($1::jsonb) AS r(equipment_id bigint,name text,alias text,brand text,blocked text,model text,models text[],serial text,serial_source text,issues jsonb,payload jsonb)
   ON CONFLICT(equipment_id) DO UPDATE SET name=EXCLUDED.name,alias=EXCLUDED.alias,brand=EXCLUDED.brand,blocked=EXCLUDED.blocked,model=EXCLUDED.model,models=EXCLUDED.models,serial=EXCLUDED.serial,serial_source=EXCLUDED.serial_source,issues=EXCLUDED.issues,payload=EXCLUDED.payload,collected_at=now(),present=true`,
        [JSON.stringify(rows.slice(n, n + 500))],
      );
    await db.query(
      "UPDATE m8_equipment_catalog SET present=false WHERE NOT(equipment_id=ANY($1::bigint[]))",
      [rows.map((r) => r.equipment_id)],
    );
    await db.query(
      "INSERT INTO m8_equipment_sync(company_id,catalog_at,error) VALUES(1,now(),NULL) ON CONFLICT(company_id) DO UPDATE SET catalog_at=now(),error=NULL",
    );
  });
  log("EQUIPAMENTOS", "Cadastro compartilhado atualizado pela empresa 1", {
    count: rows.length,
    serials: rows.filter((r) => r.serial).length,
  });
  return rows.length;
}
async function savePeople(
  db: Database,
  company: number,
  rows: ReturnType<typeof personRows>,
  person?: string,
) {
  await transaction(db, async () => {
    await db.query("SELECT pg_advisory_xact_lock(81014,$1)", [company]);
    if (person)
      await db.query(
        "UPDATE m8_person_equipment SET present=false WHERE company_id=$1 AND person_id=$2",
        [company, person],
      );
    for (let n = 0; n < rows.length; n += 500)
      await db.query(
        `INSERT INTO m8_person_equipment(company_id,person_id,link_id,equipment_id,person_name,equipment_name,payload,present,collected_at)
   SELECT $1,r.person_id,r.link_id,r.equipment_id,r.person_name,r.equipment_name,r.payload,true,now()
   FROM jsonb_to_recordset($2::jsonb) AS r(person_id bigint,link_id bigint,equipment_id bigint,person_name text,equipment_name text,payload jsonb)
   ON CONFLICT(company_id,person_id,link_id) DO UPDATE SET equipment_id=EXCLUDED.equipment_id,person_name=EXCLUDED.person_name,equipment_name=EXCLUDED.equipment_name,payload=EXCLUDED.payload,present=true,collected_at=now()`,
        [company, JSON.stringify(rows.slice(n, n + 500))],
      );
    if (person)
      await db.query(
        "UPDATE m8_equipment_person_queue SET checked_at=now(),next_at=now()+interval '24 hours',error=NULL WHERE company_id=$1 AND person_id=$2",
        [company, person],
      );
  });
}
export async function syncEquipmentPeople(
  client: Pick<M8Client, "company" | "get">,
  db: Database,
  options: { maxPeople?: number; shouldStop?: () => boolean } = {},
) {
  const company = client.company;
  const lock = (
    await db.query("SELECT pg_try_advisory_lock(81016,$1) AS ok", [company])
  ).rows[0]?.ok;
  if (!lock)
    throw new SafeError(
      "Coleta de equipamentos já está em execução para esta empresa",
    );
  let failures = 0,
    checked = 0;
  try {
    const customers = uniqueRows(
      listData(
        await client.get("/v1/configuracoes/cliente", { Page: 0, PageSize: 0 }),
      ),
    )
      .filter((r) => id(r.id) !== "0")
      .map((r) => ({
        person_id: id(r.id),
        name: text(r.razaoSocial) || text(r.fantasia) || text(r.nomeFantasia),
        document: text(r.cpfCnpj),
        payload: r,
      }));
    if (!customers.length)
      throw new SafeError(
        "Cadastro de clientes vazio; fila anterior preservada",
      );
    await transaction(db, async () => {
      for (let n = 0; n < customers.length; n += 500)
        await db.query(
          `INSERT INTO m8_customer_directory(company_id,person_id,name,document,payload,collected_at)
    SELECT $1,r.person_id,r.name,r.document,r.payload,now() FROM jsonb_to_recordset($2::jsonb) AS r(person_id bigint,name text,document text,payload jsonb)
    ON CONFLICT(company_id,person_id) DO UPDATE SET name=EXCLUDED.name,document=EXCLUDED.document,payload=EXCLUDED.payload,collected_at=now()`,
          [company, JSON.stringify(customers.slice(n, n + 500))],
        );
      await db.query(
        `INSERT INTO m8_equipment_person_queue(company_id,person_id)
    SELECT company_id,person_id FROM m8_customer_directory WHERE company_id=$1 AND person_id>0
    UNION SELECT company_id,cliente_id FROM m8_ordens_servico WHERE company_id=$1 AND cliente_id>0
    ON CONFLICT DO NOTHING`,
        [company],
      );
    });
    // Observed shortcut, not a documented full snapshot: seed returned links, never delete absent ones.
    try {
      const seed = personRows(
        await client.get("/v1/estoque/equipamento/pessoa/0", {
          Page: 0,
          PageSize: 0,
        }),
      );
      await savePeople(db, company, seed);
      await db.query(
        "INSERT INTO m8_equipment_sync(company_id,seed_at) VALUES($1,now()) ON CONFLICT(company_id) DO UPDATE SET seed_at=now()",
        [company],
      );
      log(
        "EQUIPAMENTOS",
        "Vínculos antecipados; conferência individual permanece na fila",
        { company, links: seed.length },
      );
    } catch {
      log(
        "EQUIPAMENTOS",
        "Consulta coletiva indisponível; seguindo pela consulta individual documentada",
        { company },
      );
    }
    const targets = (
      await db.query<{ person_id: string }>(
        `SELECT q.person_id::text FROM m8_equipment_person_queue q
    LEFT JOIN LATERAL(SELECT max(COALESCE(emissao,data_abertura)) AS recent FROM m8_ordens_servico o WHERE o.company_id=q.company_id AND o.cliente_id=q.person_id) h ON true
    WHERE q.company_id=$1 AND q.person_id>0 AND q.next_at<=now() ORDER BY q.checked_at NULLS FIRST,h.recent DESC NULLS LAST,q.attempted_at NULLS FIRST,q.person_id LIMIT $2`,
        [company, options.maxPeople ?? 100],
      )
    ).rows;
    for (let n = 0; n < targets.length && !options.shouldStop?.(); n += 2) {
      const batch = targets.slice(n, n + 2);
      const results = await Promise.allSettled(
        batch.map(async (p) => ({
          person: p.person_id,
          rows: personRows(
            await client.get("/v1/estoque/equipamento/pessoa/" + p.person_id, {
              Page: 0,
              PageSize: 0,
            }),
            p.person_id,
          ),
        })),
      );
      for (let i = 0; i < results.length; i++) {
        const result = results[i]!,
          person = batch[i]!.person_id;
        await db.query(
          "UPDATE m8_equipment_person_queue SET attempted_at=now() WHERE company_id=$1 AND person_id=$2",
          [company, person],
        );
        if (result.status === "fulfilled") {
          await savePeople(db, company, result.value.rows, person);
          checked++;
        } else {
          failures++;
          await db.query(
            "UPDATE m8_equipment_person_queue SET error=$3,next_at=now()+interval '1 hour' WHERE company_id=$1 AND person_id=$2",
            [company, person, safeError(result.reason)],
          );
        }
      }
    }
    const links = await rebuildEquipmentLinks(db, company);
    log("EQUIPAMENTOS", "Coleta e cruzamento concluídos", {
      company,
      checked,
      failures,
      ...links,
    });
    return { checked, failures, ...links };
  } finally {
    await db.query("SELECT pg_advisory_unlock(81016,$1)", [company]);
  }
}
