import { database } from "../lib/db";
import { m8Session } from "../lib/service-orders/m8";
import {
  equipmentPersonRows,
  saveEquipmentPersonRows,
  synchronizeEquipmentActivity,
  synchronizeEquipmentCustomerLink,
} from "../lib/equipment/relationship-integration";
const apply = process.argv.includes("--apply"),
  db = database();
try {
  const links = (
    await db.query(
      "SELECT equipment_id::text,customer_key FROM web_equipment_customer_links WHERE confirmed_at IS NULL ORDER BY created_at",
    )
  ).rows;
  const settings = (
    await db.query(
      "SELECT equipment_id::text FROM web_equipment_settings WHERE document?'inactivation' AND coalesce(document->'inactivation'->>'erpStatus','pending')<>'confirmed' OR document?'erpActivity' AND coalesce(document->'erpActivity'->>'erpStatus','pending')<>'confirmed'",
    )
  ).rows;
  const visits = (
    await db.query(
      "SELECT customer_key,equipment_key FROM web_visit_equipment_inactivations WHERE reactivated_at IS NULL AND integration_status NOT IN('confirmed','superseded')",
    )
  ).rows;
  const legacy = (await db.query("SELECT m.id,m.task_id::text,m.serial,m.customer_key FROM web_visit_machine_registrations m LEFT JOIN web_tasks t ON t.id=m.task_id WHERE m.equipment_id IS NULL AND coalesce(t.status,'not_started')<>'completed'")).rows;
  const api = await m8Session(1),
    rows = equipmentPersonRows(
      await api("/v1/estoque/equipamento/pessoa/0?Page=0&PageSize=0"),
    );
  console.log(
    JSON.stringify({
      apply,
      pendingLinks: links.length,
      legacyOpenRequests: legacy.length,
      pendingEquipmentStatuses: settings.length,
      pendingVisitStatuses: visits.length,
      erpRelationships: rows.length,
      erpInactive: rows.filter((row) => row.ativo === false).length,
    }),
  );
  if (!apply) {
    console.log(
      "Simulação: nenhuma gravação no sistema ou no ERP. Use --apply para executar.",
    );
    process.exitCode = 0;
  } else {
    // Collective endpoint only seeds returned records: never delete absent associations.
    const c = await db.connect();
    try {
      await c.query("BEGIN READ WRITE");
      await saveEquipmentPersonRows(c, rows);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    let confirmed = 0,
      pending = 0;
    for (const link of links) {
      const result = await synchronizeEquipmentCustomerLink(
        db,
        link.equipment_id,
        link.customer_key,
        async () => api,
      );
      result.integrationPending ? pending++ : confirmed++;
    }
    for (const row of settings) {
      const result = await synchronizeEquipmentActivity(
        db,
        row.equipment_id,
        undefined,
        async () => api,
      );
      result.integrationPending ? pending++ : confirmed++;
    }
    for (const row of visits) {
      if (
        /^m8:[1-9][0-9]*$/.test(row.customer_key) &&
        /^\d+$/.test(row.equipment_key)
      ) {
        const result = await synchronizeEquipmentActivity(
          db,
          row.equipment_key,
          row.customer_key,
          async () => api,
        );
        result.integrationPending ? pending++ : confirmed++;
      } else pending++;
    }
    console.log(
      JSON.stringify({
        confirmed,
        pending,
        importedRelationships: rows.length,
      }),
    );
  }
} finally {
  await db.end();
}
