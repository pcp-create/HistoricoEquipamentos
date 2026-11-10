import "server-only";
import { database } from "../db";
import {
  EquipmentRegistrationError,
  type RegistrationInput,
} from "../workshop/equipment-registration-model";
import { normalizedEquipmentSerial } from "./serial";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const internalSerial = (number: string | number) =>
  "RJ-" + String(number).padStart(4, "0");
/** Reserve once per form. Cancelled reservations stay allocated to prevent reuse. */
export async function reserveInternalSerial(id: unknown, actor: string) {
  if (typeof id !== "string" || !uuid.test(id))
    throw new EquipmentRegistrationError(
      "Solicitação de série interna inválida.",
    );
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    if (
      !(
        await c.query(
          "SELECT 1 FROM web_user_access WHERE email=$1 AND enabled",
          [actor],
        )
      ).rows.length
    )
      throw new EquipmentRegistrationError("Usuário sem acesso ativo.");
    await c.query("SELECT pg_advisory_xact_lock(829203,0)");
    const old = (
      await c.query(
        "SELECT * FROM web_equipment_internal_serials WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (old) {
      if (old.actor !== actor)
        throw new EquipmentRegistrationError(
          "Esta reserva pertence a outro usuário.",
        );
      await c.query("COMMIT");
      return { id, serial: internalSerial(old.number) };
    }
    const counter = (
      await c.query(
        "SELECT last_number FROM web_equipment_serial_counter WHERE singleton=true FOR UPDATE",
      )
    ).rows[0];
    const used = (
      await c.query(`WITH serials AS (
   SELECT web_equipment_serial_key(serial) value FROM m8_equipment_catalog
   UNION ALL SELECT web_equipment_serial_key(document->>'serial') FROM web_workshop_equipment_registrations
   UNION ALL SELECT web_equipment_serial_key(serial) FROM web_visit_machine_registrations
   UNION ALL SELECT 'RJ'||number::text FROM web_equipment_internal_serials
  ) SELECT max(CASE WHEN value ~ '^RJ[0-9]{1,12}$' THEN substring(value FROM 3)::bigint ELSE 0 END) value FROM serials`)
    ).rows[0]?.value;
    const next =
      Math.max(1, Number(counter?.last_number || 1), Number(used || 0)) + 1;
    if (next > 999999999999)
      throw new EquipmentRegistrationError(
        "O sequencial de séries internas atingiu o limite.",
      );
    await c.query(
      "UPDATE web_equipment_serial_counter SET last_number=$1 WHERE singleton=true",
      [next],
    );
    await c.query(
      "INSERT INTO web_equipment_internal_serials(id,actor,number) VALUES($1,$2,$3)",
      [id, actor, next],
    );
    await c.query("COMMIT");
    return { id, serial: internalSerial(next) };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** Called under the registration transaction's shared lock, before any ERP POST. */
export async function claimInternalSerial(
  db: any,
  input: RegistrationInput,
  actor: string,
  registration: string,
) {
  if (!input.internalSerial) {
    if (/^RJ[0-9]+$/.test(normalizedEquipmentSerial(input.serial)))
      throw new EquipmentRegistrationError(
        "Use a opção Cadastrar número de série interno para gerar uma identificação RJ.",
      );
    return;
  }
  const reserved = (
    await db.query(
      "SELECT * FROM web_equipment_internal_serials WHERE id=$1 FOR UPDATE",
      [input.internalSerialId],
    )
  ).rows[0];
  if (
    !reserved ||
    reserved.actor !== actor ||
    internalSerial(reserved.number) !== input.serial
  )
    throw new EquipmentRegistrationError(
      "A série interna não corresponde à reserva deste usuário. Gere a série pelo formulário.",
    );
  if (reserved.registration_id && reserved.registration_id !== registration) {
    const prior = (
      await db.query(
        "SELECT state FROM web_workshop_equipment_registrations WHERE id=$1",
        [reserved.registration_id],
      )
    ).rows[0];
    if (prior?.state !== "rejected")
      throw new EquipmentRegistrationError(
        "Esta série interna já está reservada para outro cadastro.",
      );
  }
  await db.query(
    "UPDATE web_equipment_internal_serials SET registration_id=$2 WHERE id=$1",
    [input.internalSerialId, registration],
  );
}
