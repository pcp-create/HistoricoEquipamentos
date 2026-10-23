import "server-only";
import { database } from "../db";
import { contactAccess } from "./contacts";
import { visitIdentity } from "./store";
import { AdminInputError } from "../admin-store";
import { createTask } from "../tasks/store";
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
  return (
    await db.query(
      "SELECT id,equipment_type,model,brand,serial,meter,task_id::text FROM web_visit_machine_registrations WHERE customer_key=$1 ORDER BY created_at,id",
      [key],
    )
  ).rows;
}
export async function registerMachine(b: any, user: AuthUser) {
  if (
    !/^m8:\d+$/.test(b.customer || "") ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      b.requestId || "",
    )
  )
    throw new AdminInputError("Cliente ou solicitação inválida.");
  for (const field of ["equipmentType", "model", "brand", "serial"])
    if (
      typeof b[field] !== "string" ||
      !b[field].trim() ||
      b[field].length > 200
    )
      throw new AdminInputError(
        "Preencha tipo, modelo, marca e número de série (até 200 caracteres).",
      );
  if (
    typeof b.meter !== "string" ||
    !/^\d+(?:[.,]\d{1,2})?$/.test(b.meter) ||
    Number(b.meter.replace(",", ".")) > 1e9
  )
    throw new AdminInputError("Informe um horímetro válido.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await contactAccess(c, b.customer, user.email);
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [b.requestId]);
    const old = (
      await c.query(
        "SELECT task_id::text,customer_key,created_by FROM web_visit_machine_registrations WHERE id=$1",
        [b.requestId],
      )
    ).rows[0];
    if (old) {
      if (old.customer_key !== b.customer || old.created_by !== user.email)
        throw new AdminInputError("Solicitação já utilizada.");
      await c.query("COMMIT");
      return { taskId: old.task_id };
    }
    const assignee = (
      await c.query(
        "SELECT equipment_assignee FROM web_visit_automation_settings WHERE id=true",
      )
    ).rows[0]?.equipment_assignee;
    if (!assignee)
      throw new AdminInputError(
        "Defina o responsável por cadastros nas configurações de Visitas.",
      );
    const customer = (
      await c.query(
        "SELECT name,document FROM m8_customer_directory WHERE person_id=$1 ORDER BY collected_at DESC LIMIT 1",
        [b.customer.slice(3)],
      )
    ).rows[0];
    const description = [
      `Solicitação de cadastro de equipamento`,
      `Cliente: ${customer.name} (${customer.document || ""})`,
      `ID do cliente: ${b.customer.slice(3)}`,
      `Tipo de equipamento: ${b.equipmentType.trim()}`,
      `Modelo: ${b.model.trim()}`,
      `Marca: ${b.brand.trim()}`,
      `Número de série: ${b.serial.trim()}`,
      `Horímetro: ${b.meter} h`,
      `Registro: ${b.requestId}`,
    ].join("\n");
    const result = await createTask(
      {
        title: ("Cadastrar equipamento - " + customer.name).slice(0, 160),
        description,
        priority: "normal",
        assignedTo: assignee,
        dueDate: "",
      },
      user,
      c,
    );
    const taskId = String(result.task.id);
    await c.query(
      "UPDATE web_tasks SET origin='Cadastro de equipamento · Visitas',customer=$2,equipment_name=$3 WHERE id=$1",
      [taskId, customer.name, `${b.equipmentType.trim()} - ${b.model.trim()}`],
    );
    await c.query(
      "INSERT INTO web_visit_machine_registrations(id,customer_key,equipment_type,model,brand,serial,meter,task_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        b.requestId,
        b.customer,
        b.equipmentType.trim(),
        b.model.trim(),
        b.brand.trim(),
        b.serial.trim(),
        b.meter.replace(",", "."),
        taskId,
        user.email,
      ],
    );
    await c.query("COMMIT");
    return { taskId };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
