import "server-only";
import type { PoolClient } from "pg";
export class TaskContextError extends Error {}
export async function creationContext(
  c: Pick<PoolClient, "query">,
  input: any,
  lockWorkshop = false,
) {
  if (input.workshopVisitId != null) {
    if (
      typeof input.workshopVisitId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.workshopVisitId,
      ) ||
      input.orderId ||
      input.orderCompany ||
      input.equipmentId
    )
      throw new TaskContextError("Vínculo de oficina inválido.");
    const visit = (
      await c.query(
        `SELECT v.id::text,v.equipment_id::text,v.exited_at,v.reconciled_out_at,COALESCE(e.name,v.source->>'equipment_description','Equipamento em oficina') name,e.model,e.serial,
      COALESCE(NULLIF(v.source->>'customer',''),(SELECT string_agg(DISTINCT p.person_name,' / ') FROM m8_person_equipment p WHERE p.equipment_id=v.equipment_id AND p.present),'') customer,w.name workshop
      FROM web_workshop_visits v LEFT JOIN m8_equipment_catalog e ON e.equipment_id=v.equipment_id LEFT JOIN web_workshops w ON w.id=v.workshop_id WHERE v.id=$1 ${lockWorkshop ? "FOR SHARE OF v" : ""}`,
        [input.workshopVisitId],
      )
    ).rows[0];
    if (!visit)
      throw new TaskContextError("Entrada da oficina não encontrada.");
    if (visit.exited_at || visit.reconciled_out_at)
      throw new TaskContextError("A entrada da oficina já foi encerrada.");
    const equipment = visit.equipment_id
      ? { id: visit.equipment_id, name: visit.name }
      : null;
    return {
      order: null,
      equipment,
      equipments: equipment ? [equipment] : [],
      customer: visit.customer,
      equipmentName: visit.name,
      workshop: visit,
    };
  }
  const orderId = input.orderId == null ? "" : String(input.orderId),
    company = String(input.orderCompany ?? ""),
    equipmentId = input.equipmentId == null ? "" : String(input.equipmentId);
  const valid = (v: string) => /^[1-9]\d{0,17}$/.test(v);
  if (
    (orderId && !valid(orderId)) ||
    (equipmentId && !valid(equipmentId)) ||
    !!orderId !== !!company ||
    (company && !["1", "2", "27404"].includes(company))
  )
    throw new TaskContextError("Vínculo de OS ou equipamento inválido.");
  let order: any = null,
    equipment: any = null,
    equipments: any[] = [];
  if (orderId) {
    order = (
      await c.query(
        `SELECT company_id,id_m8::text id,coalesce(numero_sequencia,id_m8)::text number,cliente_nome customer,equipamento equipment_name FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2`,
        [company, orderId],
      )
    ).rows[0];
    if (!order) throw new TaskContextError("OS não encontrada.");
    equipments = (
      await c.query(
        `SELECT DISTINCT e.equipment_id::text id,e.name FROM m8_order_equipment_links l JOIN m8_equipment_catalog e USING(equipment_id) WHERE l.company_id=$1 AND l.order_id=$2 AND NOT l.stale AND e.present ORDER BY e.name`,
        [company, orderId],
      )
    ).rows;
    if (equipmentId) {
      equipment = equipments.find((e) => e.id === equipmentId);
      if (!equipment)
        throw new TaskContextError("Equipamento não vinculado a esta OS.");
    } else if (input.equipmentId == null && equipments.length === 1)
      equipment = equipments[0];
  } else if (equipmentId) {
    equipment = (
      await c.query(
        `SELECT equipment_id::text id,name FROM m8_equipment_catalog WHERE equipment_id=$1 AND present`,
        [equipmentId],
      )
    ).rows[0];
    if (!equipment) throw new TaskContextError("Equipamento não encontrado.");
    equipments = [equipment];
  }
  let customer = order?.customer || "";
  if (!order && equipment)
    customer =
      (
        await c.query(
          `SELECT string_agg(DISTINCT person_name,' / ') name FROM m8_person_equipment WHERE equipment_id=$1 AND present`,
          [equipment.id],
        )
      ).rows[0]?.name || "";
  return {
    workshop: null,
    order,
    equipment,
    equipments,
    customer,
    equipmentName: equipment?.name || order?.equipment_name || "",
  };
}
