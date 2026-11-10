import "server-only";
import { randomUUID } from "node:crypto";
import { m8Session, M8RequestError } from "../service-orders/m8";
type Api = Awaited<ReturnType<typeof m8Session>>;
const positive = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;
export function equipmentPersonRows(raw: unknown, person?: string) {
  if (!Array.isArray(raw))
    throw new Error("O M8 não retornou a lista de vínculos.");
  const rows = raw.map((row) => {
    if (
      !row ||
      !positive(row.id) ||
      !positive(row.pessoaId) ||
      !positive(row.equipamentoId) ||
      typeof row.ativo !== "boolean" ||
      (person && String(row.pessoaId) !== person)
    )
      throw new Error("Vínculo M8 inválido; a coleta anterior foi preservada.");
    if (
      row.motivoInativacao !== null &&
      row.motivoInativacao !== undefined &&
      typeof row.motivoInativacao !== "string"
    )
      throw new Error("Motivo de inativação M8 inválido.");
    return row;
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error("IDs de vínculo duplicados na resposta M8.");
  return rows;
}
async function write<T>(db: any, fn: (c: any) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function saveEquipmentPersonRows(
  c: any,
  rows: any[],
  person?: string,
) {
  if (person)
    await c.query(
      "UPDATE m8_person_equipment SET present=false WHERE company_id=1 AND person_id=$1",
      [person],
    );
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows
      .slice(offset, offset + 500)
      .map((row) => ({
        person_id: row.pessoaId,
        link_id: row.id,
        equipment_id: row.equipamentoId,
        person_name: row.pessoaNome || null,
        equipment_name: row.equipamentoNome || null,
        payload: row,
      }));
    await c.query(
      `INSERT INTO m8_person_equipment(company_id,person_id,link_id,equipment_id,person_name,equipment_name,payload,present,collected_at)
   SELECT 1,r.person_id,r.link_id,r.equipment_id,r.person_name,r.equipment_name,r.payload,true,now() FROM jsonb_to_recordset($1::jsonb) AS r(person_id bigint,link_id bigint,equipment_id bigint,person_name text,equipment_name text,payload jsonb)
   ON CONFLICT(company_id,person_id,link_id) DO UPDATE SET equipment_id=EXCLUDED.equipment_id,person_name=EXCLUDED.person_name,equipment_name=EXCLUDED.equipment_name,payload=EXCLUDED.payload,present=true,collected_at=now()`,
      [JSON.stringify(batch)],
    );
  }
}
export async function refreshEquipmentPerson(
  db: any,
  api: Api,
  person: string,
) {
  const rows = equipmentPersonRows(
    await api(
      "/v1/estoque/equipamento/pessoa/" + person + "?Page=0&PageSize=0",
    ),
    person,
  );
  await write(db, (c) => saveEquipmentPersonRows(c, rows, person));
  return rows;
}
/** No automatic POST retry: a durable sending marker survives lost responses/processes. */
export async function synchronizeEquipmentCustomerLink(
  db: any,
  equipment: string,
  key: string,
  session = m8Session,
) {
  if (!/^m8:[1-9][0-9]*$/.test(key))
    return {
      integrationPending: true,
      integrationError: "O cliente ainda não possui cadastro no M8.",
    };
  const token = randomUUID(),
    person = key.slice(3);
  if (!positive(Number(person)) || !positive(Number(equipment)))
    return {
      integrationPending: true,
      integrationError: "Identificador fora do intervalo aceito pelo M8.",
    };
  const claimed = await write(
    db,
    async (c) =>
      (
        await c.query(
          `UPDATE web_equipment_customer_links SET integration_lease=$3,integration_lease_at=now() WHERE equipment_id=$1 AND customer_key=$2 AND confirmed_at IS NULL AND (integration_lease IS NULL OR integration_lease_at<now()-interval '5 minutes') RETURNING *`,
          [equipment, key, token],
        )
      ).rows[0],
  );
  if (!claimed) {
    const row = (
      await db.query(
        "SELECT confirmed_at,integration_error FROM web_equipment_customer_links WHERE equipment_id=$1 AND customer_key=$2",
        [equipment, key],
      )
    ).rows[0];
    return {
      integrationPending: !row?.confirmed_at,
      integrationError: row?.integration_error || null,
    };
  }
  let state = claimed.integration_state || "pending",
    error: string | null = null;
  try {
    const api = await session(1);
    let rows = await refreshEquipmentPerson(db, api, person);
    if (!rows.some((row) => String(row.equipamentoId) === equipment)) {
      if (state !== "pending")
        throw new Error(
          "Envio anterior ainda não confirmado no M8. A consulta não repetirá o cadastro do vínculo.",
        );
      await write(db, async (c) => {
        await c.query(
          "UPDATE web_equipment_customer_links SET integration_state='sending' WHERE equipment_id=$1 AND customer_key=$2 AND integration_lease=$3",
          [equipment, key, token],
        );
      });
      state = "sending";
      await api("/v1/estoque/equipamento/pessoa", {
        equipamentoId: Number(equipment),
        pessoaId: Number(person),
      });
      rows = await refreshEquipmentPerson(db, api, person);
      if (!rows.some((row) => String(row.equipamentoId) === equipment))
        throw new Error(
          "O M8 recebeu o vínculo, mas ainda não o confirmou na consulta.",
        );
    }
    state = "confirmed";
  } catch (e) {
    error =
      e instanceof Error
        ? e.message.slice(0, 1500)
        : "Não foi possível confirmar o vínculo no M8.";
    state =
      state === "sending"
        ? e instanceof M8RequestError && !e.uncertain
          ? "pending"
          : "uncertain"
        : state;
  }
  await write(db, async (c) => {
    await c.query(
      `UPDATE web_equipment_customer_links SET integration_state=$4,integration_error=$5,integration_lease=NULL,integration_lease_at=NULL,confirmed_at=CASE WHEN $4='confirmed' THEN coalesce(confirmed_at,now()) ELSE confirmed_at END WHERE equipment_id=$1 AND customer_key=$2 AND integration_lease=$3`,
      [equipment, key, token, state, error],
    );
  });
  return { integrationPending: state !== "confirmed", integrationError: error };
}
/** PATCH sets an idempotent desired status; always use a fresh relationship ID and read back. */
export async function synchronizeEquipmentActivity(
  db: any,
  equipment: string,
  customerKey?: string,
  session = m8Session,
) {
  const api = await session(1);
  return write(db, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(83014,hashtext($1))", [
      equipment,
    ]);
    const settings = (
      await c.query(
        "SELECT document,version FROM web_equipment_settings WHERE equipment_id=$1 FOR UPDATE",
        [equipment],
      )
    ).rows[0];
    const visit = customerKey
      ? (
          await c.query(
            "SELECT * FROM web_visit_equipment_inactivations WHERE customer_key=$1 AND equipment_key=$2 AND reactivated_at IS NULL AND integration_status<>'superseded' FOR UPDATE",
            [customerKey, equipment],
          )
        ).rows[0]
      : null;
    const intent = customerKey
      ? visit
        ? { active: false, reason: visit.reason }
        : null
      : settings?.document.erpActivity ||
        (settings?.document.inactivation
          ? { active: false, reason: settings.document.inactivation.reason }
          : null);
    if (!intent) return { integrationPending: false };
    const personIds = customerKey
      ? /^m8:[1-9][0-9]*$/.test(customerKey)
        ? [customerKey.slice(3)]
        : []
      : (
          await c.query(
            "SELECT DISTINCT person_id::text FROM m8_person_equipment WHERE equipment_id=$1 AND present",
            [equipment],
          )
        ).rows.map((row: any) => row.person_id);
    const errors: string[] = [];
    let confirmed = 0;
    if (!personIds.length)
      errors.push("Equipamento sem vínculo de cliente identificado no M8.");
    for (const person of personIds) {
      try {
        let rows = equipmentPersonRows(
          await api(
            "/v1/estoque/equipamento/pessoa/" + person + "?Page=0&PageSize=0",
          ),
          person,
        );
        await saveEquipmentPersonRows(c, rows, person);
        const targets = rows.filter(
          (row) => String(row.equipamentoId) === equipment,
        );
        if (!targets.length)
          throw new Error("O vínculo com o cliente não foi localizado no M8.");
        for (const target of targets) {
          if (
            target.ativo !== intent.active ||
            (!intent.active &&
              String(target.motivoInativacao || "").trim() !==
                String(intent.reason).trim())
          ) {
            await api(
              "/v1/estoque/equipamento/pessoa/" + target.id,
              {
                ativo: intent.active ? "Sim" : "Nao",
                motivoInativacao: intent.active ? "" : intent.reason,
              },
              "PATCH",
            );
            rows = equipmentPersonRows(
              await api(
                "/v1/estoque/equipamento/pessoa/" +
                  person +
                  "?Page=0&PageSize=0",
              ),
              person,
            );
            await saveEquipmentPersonRows(c, rows, person);
            const after = rows.find(
              (row) =>
                row.id === target.id && String(row.equipamentoId) === equipment,
            );
            if (
              !after ||
              after.ativo !== intent.active ||
              (!intent.active &&
                String(after.motivoInativacao || "").trim() !==
                  String(intent.reason).trim())
            )
              throw new Error(
                "O M8 ainda não confirmou o status e o motivo enviados.",
              );
          }
          confirmed++;
        }
      } catch (e) {
        errors.push(
          e instanceof Error ? e.message : "Falha ao conferir o vínculo no M8.",
        );
      }
    }
    const status = errors.length ? "pending" : "confirmed",
      error = errors.join(" · ").slice(0, 1500) || null;
    if (customerKey && visit)
      await c.query(
        "UPDATE web_visit_equipment_inactivations SET integration_status=$3,integration_error=$4,confirmed_at=CASE WHEN $3='confirmed' THEN now() ELSE confirmed_at END WHERE customer_key=$1 AND equipment_key=$2",
        [customerKey, equipment, status, error],
      );
    else if (settings) {
      const document = {
        ...settings.document,
        erpActivity: {
          ...(settings.document.erpActivity || intent),
          erpStatus: status,
          error,
        },
      };
      if (document.inactivation)
        document.inactivation = {
          ...document.inactivation,
          erpStatus: status,
          error,
        };
      if (JSON.stringify(document) !== JSON.stringify(settings.document))
        await c.query(
          "UPDATE web_equipment_settings SET document=$2,version=version+1,updated_at=now() WHERE equipment_id=$1",
          [equipment, JSON.stringify(document)],
        );
    }
    return {
      integrationPending: !!errors.length,
      integrationError: error,
      confirmed,
    };
  });
}
