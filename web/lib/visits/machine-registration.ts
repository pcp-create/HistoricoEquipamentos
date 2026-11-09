import { linkTaskAssignee } from "../equipment/customer-links";
import { m8Session } from "../service-orders/m8";
import { registerWorkshopEquipment } from "../workshop/equipment-registration";
import {
  equipmentRegistrationInput,
  workshopEquipmentTypes,
} from "../workshop/equipment-registration-model";
import { normalizedEquipmentSerial } from "../equipment/serial";
import { equipmentInactivations } from "./equipment-inactivation";
import "server-only";
import { database } from "../db";
import { contactAccess } from "./contacts";
import { visitIdentity } from "./store";
import { AdminInputError } from "../admin-store";
import type { AuthUser } from "../user-display-name";
export async function machineSettings(email: string) {
  const db = database();
  await visitIdentity(db, email);
  const settings = (
    await db.query(
      "SELECT equipment_assignee FROM web_visit_automation_settings WHERE id=true",
    )
  ).rows[0];
  const users = (
    await db.query(
      "SELECT email,display_name FROM web_user_access WHERE enabled AND phone IS NOT NULL AND phone<>'' ORDER BY display_name,email",
    )
  ).rows;
  return { equipmentAssignee: settings?.equipment_assignee || "", users };
}
export async function saveMachineSettings(email: string, assignee: unknown) {
  if (typeof assignee !== "string")
    throw new AdminInputError("Selecione o responsável.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await visitIdentity(c, email);
    const u = (
      await c.query(
        "SELECT email FROM web_user_access WHERE email=$1 AND enabled AND phone IS NOT NULL AND phone<>'' FOR SHARE",
        [assignee],
      )
    ).rows[0];
    if (!u)
      throw new AdminInputError(
        "Escolha um responsável ativo com WhatsApp cadastrado.",
      );
    await c.query(
      "INSERT INTO web_visit_automation_settings(id,equipment_assignee,updated_by) VALUES(true,$1,$2) ON CONFLICT(id) DO UPDATE SET equipment_assignee=$1,updated_by=$2,updated_at=now()",
      [assignee, email],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function listMachines(key: string, email: string) {
  const db = database();
  await contactAccess(db, key, email);
  const rows = (
    await db.query(
      `SELECT m.*,m.id::text,m.task_id::text,
 CASE WHEN m.equipment_id IS NULL THEN false ELSE l.confirmed_at IS NULL AND NOT EXISTS(SELECT 1 FROM m8_person_equipment p WHERE p.present AND p.equipment_id=m.equipment_id AND 'm8:'||p.person_id::text=m.customer_key) END integration_pending,
 coalesce(l.task_id,m.task_id)::text task_id
 FROM web_visit_machine_registrations m LEFT JOIN web_equipment_customer_links l ON l.equipment_id=m.equipment_id AND l.customer_key=m.customer_key
 WHERE m.customer_key=$1 ORDER BY m.created_at,m.id`,
      [key],
    )
  ).rows;
  const links = (
    await db.query(
      `SELECT 'link:'||l.equipment_id::text id,l.equipment_id::text,l.task_id::text,'Equipamento' equipment_type,e.model,e.serial,true integration_pending FROM web_equipment_customer_links l JOIN m8_equipment_catalog e ON e.equipment_id=l.equipment_id WHERE l.customer_key=$1 AND l.confirmed_at IS NULL AND l.source='visits' AND NOT EXISTS(SELECT 1 FROM web_visit_machine_registrations m WHERE m.customer_key=l.customer_key AND m.equipment_id=l.equipment_id) AND NOT EXISTS(SELECT 1 FROM m8_person_equipment p WHERE p.present AND p.equipment_id=l.equipment_id AND 'm8:'||p.person_id::text=l.customer_key)`,
      [key],
    )
  ).rows;
  const inactive = await equipmentInactivations(db);
  return [
    ...rows.filter((row: any) => !row.equipment_id || row.integration_pending),
    ...links,
  ].map((row: any) => ({
    ...row,
    inactivation: inactive.find(
      (item: any) =>
        item.customer_key === key &&
        item.equipment_key ===
          (row.equipment_id ? String(row.equipment_id) : "pending:" + row.id),
    ),
  }));
}
export async function registerMachine(
  b: any,
  user: AuthUser,
  transaction?: any,
  session?: typeof m8Session,
) {
  const key = String(b.customerKey || b.customer || "");
  if (
    !/^(m8:\d+|lead:[0-9a-f-]{36})$/i.test(key) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      b.requestId || "",
    )
  )
    throw new AdminInputError("Cliente ou solicitação inválida.");
  const db = transaction || database();
  await contactAccess(db, key, user.email);
  await linkTaskAssignee(db);
  const old = (
    await db.query(
      "SELECT * FROM web_visit_machine_registrations WHERE id=$1",
      [b.requestId],
    )
  ).rows[0];
  if (old && (old.customer_key !== key || old.created_by !== user.email))
    throw new AdminInputError("Solicitação já utilizada.");
  if (b.resume && !old)
    throw new AdminInputError("Solicitação não encontrada.");
  const fold = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  const legacyType = workshopEquipmentTypes.find(
    (type) =>
      fold(type.label) ===
      fold(String(b.equipmentType || old?.equipment_type || "")),
  )?.id;
  const raw = b.resume
    ? old.registration_document || {
        ownership: "customer",
        type: legacyType,
        model: old.model,
        serial: old.serial,
        brand: old.brand,
        meter: String(old.meter),
        notes: old.observations,
      }
    : b.registration || {
        ...b,
        type: b.type || legacyType,
        notes: b.notes ?? b.observations,
      };
  const input = equipmentRegistrationInput({
    ...raw,
    ownership: "customer",
    customerKey: key,
    source: "visits",
  });
  if (
    old?.registration_document &&
    JSON.stringify(equipmentRegistrationInput(old.registration_document)) !==
      JSON.stringify(input)
  )
    throw new AdminInputError("Identificador utilizado para outro cadastro.");
  if (!old) {
    const c = transaction || (await database().connect());
    try {
      if (!transaction) await c.query("BEGIN READ WRITE");
      await c.query("SELECT pg_advisory_xact_lock(829203,0)");
      const keySerial = normalizedEquipmentSerial(input.serial);
      const duplicate = (
        await c.query(
          `SELECT equipment_id FROM m8_equipment_catalog WHERE present AND web_equipment_serial_key(serial)=$1 LIMIT 1`,
          [keySerial],
        )
      ).rows[0];
      if (duplicate)
        throw new AdminInputError(
          "Série já cadastrada no equipamento " +
            duplicate.equipment_id +
            ". Selecione o cadastro existente.",
        );
      if (
        (
          await c.query(
            `SELECT 1 FROM web_visit_machine_registrations WHERE id<>$2 AND equipment_id IS NULL AND web_equipment_serial_key(serial)=$1 LIMIT 1`,
            [keySerial, b.requestId],
          )
        ).rows.length
      )
        throw new AdminInputError("Já existe uma solicitação para esta série.");
      await c.query(
        `INSERT INTO web_visit_machine_registrations(id,customer_key,equipment_type,model,brand,serial,meter,created_by,observations,registration_document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
        [
          b.requestId,
          key,
          workshopEquipmentTypes.find((type) => type.id === input.type)!.label,
          input.model,
          input.brand || "",
          input.serial,
          input.meter ?? 0,
          user.email,
          input.notes,
          JSON.stringify(input),
        ],
      );
      const reserved = (
        await c.query(
          "SELECT customer_key,created_by,registration_document FROM web_visit_machine_registrations WHERE id=$1",
          [b.requestId],
        )
      ).rows[0];
      if (
        reserved.customer_key !== key ||
        reserved.created_by !== user.email ||
        JSON.stringify(
          equipmentRegistrationInput(reserved.registration_document),
        ) !== JSON.stringify(input)
      )
        throw new AdminInputError(
          "Solicitação já utilizada para outro cadastro.",
        );
      if (!transaction) await c.query("COMMIT");
    } catch (e) {
      if (!transaction) await c.query("ROLLBACK");
      throw e;
    } finally {
      if (!transaction) c.release();
    }
  }
  if (transaction)
    return {
      state: "queued",
      taskId: null as string | null,
      equipment: null,
      message: "Cadastro reservado para envio após salvar a visita.",
    };
  const result = await registerWorkshopEquipment(
    { ...input, requestId: b.requestId },
    user.email,
    session,
  );
  if (result.state === "complete" && result.equipment) {
    const c = await database().connect();
    try {
      await c.query("BEGIN READ WRITE");
      await c.query(
        "UPDATE web_visit_machine_registrations SET equipment_id=$2,task_id=$3,registration_document=$4 WHERE id=$1",
        [
          b.requestId,
          result.equipment.id,
          result.equipment.taskId || null,
          JSON.stringify(input),
        ],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return { ...result, taskId: result.equipment?.taskId || null };
}
