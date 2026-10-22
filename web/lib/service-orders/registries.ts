import "server-only";
import { database } from "../db";
import {
  lastManualUpdate,
  recordManualUpdate,
  type RegistryKey,
} from "../registry-manual-updates";
import { m8Session } from "./m8";
export const registryPaths: Record<string, string> = {
  "payment-terms": "/v1/financeiro/condicaopagamento",
  "flow-statuses": "/v1/faturamento/status",
  freight: "/v1/configuracoes/frete",
};
export const manualKinds = [
  "service-types",
  "service-origins",
  "order-statuses",
];
export function validRegistry(kind: string) {
  return Object.hasOwn(registryPaths, kind) || manualKinds.includes(kind);
}
export async function listRegistry(kind: string) {
  if (!validRegistry(kind)) throw new Error("Cadastro inválido.");
  return {
    rows: (
      await database().query(
        "SELECT id::text,name,active,warranty_id,warranty_description,updated_at AS collected_at FROM service_order_registries WHERE kind=$1 ORDER BY service_order_registries.id",
        [kind],
      )
    ).rows,
    lastManualUpdate: await lastManualUpdate(kind as RegistryKey),
  };
}
export async function saveRegistry(kind: string, body: any, email?: string) {
  if (!validRegistry(kind)) throw new Error("Cadastro inválido.");
  let rows: any[];
  if (manualKinds.includes(kind)) {
    if (
      !Number.isInteger(Number(body.id)) ||
      Number(body.id) < 1 ||
      Number(body.id) > 2147483647 ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 200 ||
      typeof body.active !== "boolean"
    )
      throw new Error("Informe ID M8, nome e situação válidos.");
    if (
      kind === "service-types" &&
      (!Number.isInteger(Number(body.warranty_id)) ||
        Number(body.warranty_id) < 1 ||
        Number(body.warranty_id) > 2147483647 ||
        typeof body.warranty_description !== "string" ||
        !body.warranty_description.trim() ||
        body.warranty_description.length > 500)
    )
      throw new Error("Informe o ID e a descrição do prazo de garantia.");
    rows = [
      {
        id: Number(body.id),
        name: body.name.trim(),
        active: body.active,
        warranty_id: kind === "service-types" ? Number(body.warranty_id) : null,
        warranty_description:
          kind === "service-types" ? body.warranty_description.trim() : null,
        payload: {},
      },
    ];
  } else {
    const m8 = await m8Session(1);
    const data = await m8(registryPaths[kind] + "?Page=0&PageSize=0");
    if (!Array.isArray(data) || !data.length)
      throw new Error("Lista M8 vazia; cadastro anterior preservado.");
    rows = data.map((r) => {
      if (
        !Number.isInteger(r.id) ||
        r.id < (kind === "freight" ? 0 : 1) ||
        typeof r.nome !== "string" ||
        !r.nome.trim() ||
        (r.ativo != null && typeof r.ativo !== "boolean")
      )
        throw new Error("Cadastro M8 inválido.");
      return {
        id: r.id,
        name: r.nome.trim(),
        active: r.ativo !== false,
        payload: r,
      };
    });
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw new Error("IDs duplicados na resposta M8.");
  }
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(81023)");
    await c.query(
      `INSERT INTO service_order_registries(kind,id,name,active,warranty_id,warranty_description,payload,updated_by)
   SELECT $1,id,name,active,warranty_id,warranty_description,payload,$3 FROM jsonb_to_recordset($2::jsonb) AS r(id integer,name text,active boolean,warranty_id integer,warranty_description text,payload jsonb)
   ON CONFLICT(kind,id) DO UPDATE SET name=EXCLUDED.name,active=EXCLUDED.active,warranty_id=EXCLUDED.warranty_id,warranty_description=EXCLUDED.warranty_description,payload=EXCLUDED.payload,updated_at=now(),updated_by=EXCLUDED.updated_by`,
      [kind, JSON.stringify(rows), email || "Carga inicial"],
    );
    if (email) await recordManualUpdate(c, kind as RegistryKey, email);
    await c.query("COMMIT");
    return rows.length;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
