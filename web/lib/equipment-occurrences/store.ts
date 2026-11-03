import "server-only";
import { randomUUID } from "node:crypto";
export class OccurrenceInputError extends Error {}
export function equipmentKey(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,17}$/.test(value))
    throw new OccurrenceInputError("Selecione um equipamento válido.");
  return value;
}
export function occurrenceInput(input: any) {
  const equipmentId = equipmentKey(input?.equipmentId);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const occurredOn = input.occurredOn;
  if (!title || title.length > 160)
    throw new OccurrenceInputError("Informe um título com até 160 caracteres.");
  if (!description || description.length > 12000)
    throw new OccurrenceInputError(
      "Descreva a ocorrência com até 12.000 caracteres.",
    );
  if (
    typeof occurredOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) ||
    Number(occurredOn.slice(0, 4)) < 1 ||
    !Number.isFinite(Date.parse(occurredOn)) ||
    new Date(occurredOn).toISOString().slice(0, 10) !== occurredOn
  )
    throw new OccurrenceInputError("Informe uma data válida.");
  return { equipmentId, title, description, occurredOn };
}
export async function occurrencesForEquipment(c: any, ids: string[]) {
  if (!ids.length) return [];
  // Allows the web release to be staged before the migration without hiding SQL errors.
  if (
    !(
      await c.query(
        "SELECT to_regclass('public.web_equipment_occurrences') AS name",
      )
    ).rows[0]?.name
  )
    return [];
  return (
    await c.query(
      `SELECT b.id,b.equipment_id::text,b.occurred_on::text,b.title,b.description,b.created_at,
    COALESCE(NULLIF(u.display_name,''),b.created_by) AS author,e.name AS equipment_name,e.serial
    FROM web_equipment_occurrences b JOIN m8_equipment_catalog e USING(equipment_id)
    LEFT JOIN web_user_access u ON u.email=b.created_by
    WHERE b.equipment_id=ANY($1::bigint[]) ORDER BY b.occurred_on DESC,b.created_at DESC,b.id`,
      [ids.map(equipmentKey)],
    )
  ).rows;
}
export async function createOccurrence(c: any, input: unknown, email: string) {
  const b = occurrenceInput(input);
  const e = (
    await c.query(
      "SELECT equipment_id FROM m8_equipment_catalog WHERE equipment_id=$1 AND present",
      [b.equipmentId],
    )
  ).rows[0];
  if (!e)
    throw new OccurrenceInputError(
      "O equipamento não está disponível no cadastro.",
    );
  const id = randomUUID();
  await c.query(
    `INSERT INTO web_equipment_occurrences(id,equipment_id,occurred_on,title,description,created_by) VALUES($1,$2,$3,$4,$5,$6)`,
    [id, b.equipmentId, b.occurredOn, b.title, b.description, email],
  );
  return { id };
}

// The technician may select only a machine from the dispatched operation.
export async function operationOccurrenceEquipment(
  c: any,
  operationId: unknown,
  email: string,
) {
  if (
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      operationId,
    )
  )
    throw new OccurrenceInputError("Operação inválida.");
  const p = (
    await c.query(
      `SELECT p.document,s.company_id,s.order_id FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id WHERE p.id=$1 AND s.active AND p.sent_at IS NOT NULL AND (p.document->>'responsible'=$2 OR p.document->'support' ? $2)`,
      [operationId, email],
    )
  ).rows[0];
  if (!p)
    throw new OccurrenceInputError(
      "Esta operação não está disponível para registrar B.O.",
    );
  return (
    await c.query(
      `SELECT e.equipment_id::text AS id,e.name,e.serial FROM m8_equipment_catalog e WHERE e.present AND ${p.document.equipmentId ? "e.equipment_id=$1" : `(EXISTS(SELECT 1 FROM m8_order_equipment_links l WHERE l.equipment_id=e.equipment_id AND l.company_id=$1 AND l.order_id=$2 AND NOT l.stale) OR EXISTS(SELECT 1 FROM m8_ordens_servico o WHERE o.company_id=$1 AND o.id_m8=$2 AND to_jsonb(o)->>'produto_equipamento_id'=e.equipment_id::text))`} ORDER BY e.name,e.equipment_id`,
      p.document.equipmentId
        ? [equipmentKey(String(p.document.equipmentId))]
        : [p.company_id, p.order_id],
    )
  ).rows;
}
export async function createOperationOccurrence(
  c: any,
  input: any,
  email: string,
) {
  const b = occurrenceInput(input);
  const equipment = await operationOccurrenceEquipment(
    c,
    input.operationId,
    email,
  );
  if (!equipment.some((e: any) => e.id === b.equipmentId))
    throw new OccurrenceInputError(
      "Selecione um equipamento vinculado a esta operação.",
    );
  return createOccurrence(c, input, email);
}
