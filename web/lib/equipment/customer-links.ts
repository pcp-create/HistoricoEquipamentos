import "server-only";
import { createTask } from "../tasks/store";
import { contactAccess } from "../visits/contacts";
import { EquipmentRegistrationError } from "../workshop/equipment-registration-model";
export async function linkTaskAssignee(db: any) {
  const assignee = (
    await db.query(
      "SELECT equipment_assignee FROM web_visit_automation_settings WHERE id=true",
    )
  ).rows[0]?.equipment_assignee;
  if (!assignee)
    throw new EquipmentRegistrationError(
      "Defina o responsável pelo vínculo de equipamentos nas configurações de Visitas.",
    );
  const user = (
    await db.query("SELECT enabled,phone FROM web_user_access WHERE email=$1", [
      assignee,
    ])
  ).rows[0];
  if (!user?.enabled || !user.phone)
    throw new EquipmentRegistrationError(
      "Escolha um responsável ativo com WhatsApp para o vínculo dos equipamentos.",
    );
  return assignee as string;
}
export async function customerForEquipment(
  db: any,
  key: string,
  actor: string,
) {
  await contactAccess(db, key, actor);
  const row = (
    await db.query(
      key.startsWith("m8:")
        ? "SELECT name FROM m8_customer_directory WHERE person_id=$1 ORDER BY collected_at DESC LIMIT 1"
        : "SELECT name FROM web_sales_leads WHERE id=$1",
      [key.slice(key.startsWith("m8:") ? 3 : 5)],
    )
  ).rows[0];
  if (!row)
    throw new EquipmentRegistrationError("Selecione um cliente válido.");
  return row.name as string;
}
export async function saveEquipmentCustomerLink(
  db: any,
  equipment: any,
  key: string,
  actor: string,
  source: string,
  registration: string | null,
) {
  const name = await customerForEquipment(db, key, actor);
  const confirmed =
    (
      await db.query(
        "SELECT 1 FROM m8_person_equipment WHERE present AND equipment_id=$1 AND 'm8:'||person_id::text=$2 LIMIT 1",
        [equipment.id, key],
      )
    ).rows.length > 0;
  const row = (
    await db.query(
      `INSERT INTO web_equipment_customer_links(equipment_id,customer_key,customer_name,actor,source,registration_id,confirmed_at)
 VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::boolean THEN now() END) ON CONFLICT(equipment_id,customer_key) DO UPDATE SET customer_name=EXCLUDED.customer_name,source=CASE WHEN EXCLUDED.source='visits' THEN 'visits' ELSE web_equipment_customer_links.source END RETURNING *`,
      [equipment.id, key, name, actor, source, registration, confirmed],
    )
  ).rows[0];
  if (!confirmed && source === "visits" && key.startsWith("lead:") && !row.task_id) {
    const assignee = await linkTaskAssignee(db);
    const result = await createTask(
      {
        title: ("Vincular equipamento ao cliente - " + name).slice(0, 160),
        description: `O equipamento já foi cadastrado no ERP. Realize somente o vínculo manual com o cliente.\nCliente: ${name}\nVínculo: ${key}\nEquipamento: ${equipment.id} - ${equipment.name}\nSérie: ${equipment.serial}\nA pendência será retirada quando a integração identificar esse vínculo.`,
        priority: "normal",
        assignedTo: assignee,
        dueDate: "",
      },
      { id: actor, email: actor },
      db,
    );
    row.task_id = String(result.task.id);
    await db.query(
      "UPDATE web_equipment_customer_links SET task_id=$3 WHERE equipment_id=$1 AND customer_key=$2",
      [equipment.id, key, row.task_id],
    );
    await db.query(
      "UPDATE web_tasks SET origin='Vínculo de equipamento · Visitas',customer=$2,equipment_name=$3,equipment_id=$4 WHERE id=$1",
      [row.task_id, name, equipment.name, equipment.id],
    );
  }
  return {
    client: name,
    integrationPending: !confirmed,
    taskId: row.task_id ? String(row.task_id) : null,
  };
}
