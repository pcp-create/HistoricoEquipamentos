import "server-only";
import { database } from "../db";
import { equipmentList } from "./store";
import { customerHealth } from "./customer-health";
export async function customerFleet(customer: string) {
  const db = database();
  if (!customer)
    return {
      clients: (
        await db.query(
          `SELECT person_id::text id,max(person_name) name,count(DISTINCT equipment_id)::int machines FROM m8_person_equipment WHERE present GROUP BY person_id ORDER BY max(person_name),person_id`,
        )
      ).rows,
    };
  if (!/^[1-9]\d{0,17}$/.test(customer)) throw new Error("INVALID_CUSTOMER");
  const source = await equipmentList(new URLSearchParams({ all: "1" }));
  const equipment = source.rows.filter((e: any) =>
    e.clients.some((c: any) => c.id === customer),
  );
  const ids = equipment.map((e: any) => e.id);
  const [ops, orders, workshops] = await Promise.all([
    db.query(
      `SELECT p.id,p.document->>'equipmentId' equipment_id,p.document->>'description' description,p.document->>'date' date,p.document->>'time' time,p.status,p.ends_at,
 (p.status IN ('reviewed','completed') AND p.document->'checklistRun' IS NOT NULL AND p.document->'checklistRun'<>'null'::jsonb) report,
 COALESCE(o.numero_sequencia,o.id_m8)::text order_number
 FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
 WHERE p.document->>'equipmentId'=ANY($1::text[]) AND o.cliente_id=$2 AND lower(coalesce(o.status,'')) NOT IN ('cancelada','cancelado') ORDER BY p.document->>'date' DESC NULLS LAST,p.position`,
      [ids, customer],
    ),
    db.query(
      `SELECT DISTINCT l.equipment_id::text,o.id_m8::text id,o.company_id,COALESCE(o.numero_sequencia,o.id_m8)::text number FROM m8_equipment_linked l JOIN m8_ordens_servico o ON o.company_id=l.company_id AND o.id_m8=l.order_id WHERE l.equipment_id=ANY($1::bigint[]) AND o.cliente_id=$2 AND lower(trim(o.status))='pendente'`,
      [ids, customer],
    ),
    db.query(
      `SELECT equipment_id::text,stage,expected_at FROM web_workshop_visits WHERE equipment_id=ANY($1::bigint[]) AND exited_at IS NULL AND reconciled_out_at IS NULL`,
      [ids],
    ),
  ]);
  return {
    customer: equipment[0]?.clients.find((c: any) => c.id === customer) || {
      id: customer,
      name: "Cliente sem equipamentos vinculados",
    },
    updatedAt: new Date().toISOString(),
    machines: equipment.map((e: any) => {
      const workshop = workshops.rows.find((w) => w.equipment_id === e.id);
      const openOrders = orders.rows
        .filter((o) => o.equipment_id === e.id)
        .map((o) => ({ id: o.id, company: o.company_id, number: o.number }));
      const operations = ops.rows
        .filter((o) => o.equipment_id === e.id)
        .map(({ equipment_id, ...o }) => o);
      const safeWorkshop = workshop
        ? {
            label:
              workshop.stage === "approval"
                ? "Aguardando aprovação do cliente"
                : workshop.stage === "repair"
                  ? "Em execução"
                  : "Em acompanhamento na oficina",
            expectedAt: workshop.expected_at,
          }
        : null;
      return {
        id: e.id,
        name: e.name,
        model: e.model,
        brand: e.brand,
        serial: e.serial,
        plans: e.plans,
        nextDue: e.forecast?.due || null,
        signal: customerHealth({ ...e, workshop: safeWorkshop, openOrders }),
        workshop: safeWorkshop,
        openOrders,
        operations,
      };
    }),
  };
}
