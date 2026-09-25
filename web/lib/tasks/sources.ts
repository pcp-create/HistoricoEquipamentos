import {
  predictPlans,
  preventiveCycle,
} from "../equipment-management/preventive-hierarchy";
import "server-only";
import { database } from "../db";
import { rentalStatuses } from "../equipment-management/rental-status";
import { rentalUsage } from "../equipment-management/rental-usage";
import {
  brazilToday,
  emptyOperating,
  predict,
} from "../equipment-management/planning";
export type TaskSource = {
  key: string;
  cycle: string;
  equipment: string;
  plan: string | null;
  origin: string;
  title: string;
  name: string;
  customer: string;
  state: string;
  alert: boolean;
  resolved: boolean;
  priority: "normal" | "high" | "urgent";
  due: string | null;
};
export async function taskSources(
  forceHierarchy?: boolean,
): Promise<TaskSource[]> {
  const hierarchy =
    forceHierarchy ??
    (
      await database().query(
        "SELECT enabled FROM web_task_hierarchy WHERE id=1",
      )
    ).rows[0]?.enabled ??
    false;
  const rows = (
    await database()
      .query(`SELECT e.equipment_id::text id,e.name,COALESCE(e.payload->>'familiaId'='3',false) rental,COALESCE(s.document,'{}') settings,
 COALESCE((SELECT string_agg(DISTINCT p.person_name,' / ') FROM m8_person_equipment p WHERE p.equipment_id=e.equipment_id AND p.present),'Sem cliente vinculado') customer,
 COALESCE((SELECT jsonb_agg(p.document || jsonb_build_object('id',p.id)) FROM web_equipment_plans p WHERE p.equipment_id=e.equipment_id AND NOT p.archived),'[]') plans
 FROM m8_equipment_catalog e LEFT JOIN web_equipment_settings s USING(equipment_id) WHERE e.present`)
  ).rows;
  const rentalIds = rows.filter((e) => e.rental).map((e) => e.id);
  const statuses = await rentalStatuses(rentalIds),
    usage = await rentalUsage(rentalIds),
    today = brazilToday();
  const result: TaskSource[] = [];
  for (const e of rows) {
    const rental = statuses.get(e.id),
      contract = rental?.contract;
    if (e.rental && rental && ["rented", "loaned"].includes(rental.key)) {
      const state = contract?.key || "incomplete";
      result.push({
        key: `rental:${e.id}:${rental.company}:${rental.order}`,
        cycle: "contract",
        equipment: e.id,
        plan: null,
        origin:
          rental.key === "rented" ? "Máquina de Locação" : "Máquina Emprestada",
        title: `Acompanhar ${rental.key === "rented" ? "locação" : "empréstimo"}`,
        name: e.name,
        customer: rental.customer || e.customer,
        state,
        alert: ["soon", "overdue"].includes(state),
        resolved: state === "current",
        priority:
          state === "overdue"
            ? "urgent"
            : (contract?.remaining ?? 99) < 5
              ? "high"
              : "normal",
        due: contract?.end || null,
      });
    }
    const planned = predictPlans(
      e.plans,
      { ...emptyOperating, ...e.settings },
      today,
      usage.get(e.id),
    );
    const hourly = planned.filter((p) => p.hours);
    const representative =
      hourly.find(
        (p) =>
          !p.coveredBy &&
          ["soon", "due", "overdue"].includes(p.forecast.status) &&
          !p.forecast.inconsistent,
      ) ||
      [...hourly].sort((a, b) =>
        (a.forecast.due || "9999").localeCompare(b.forecast.due || "9999"),
      )[0];
    for (const p of e.plans) {
      if (hierarchy && p.hours && p.id !== representative?.id) continue;
      const f = predict(
        p,
        { ...emptyOperating, ...e.settings },
        today,
        usage.get(e.id),
      );
      const reliable = !f.incomplete && !f.inconsistent;
      result.push({
        key:
          hierarchy && p.hours
            ? `preventive-group:${e.id}`
            : `preventive:${p.id}`,
        cycle:
          hierarchy && p.hours
            ? preventiveCycle(hourly)
            : JSON.stringify([p.lastDate, p.lastOrder, p.lastMeter]),
        equipment: e.id,
        plan: p.id,
        origin: e.rental
          ? rental?.key === "loaned"
            ? "Preventiva de Equipamento Emprestado"
            : rental?.key === "rented"
              ? "Preventiva de Equipamento Locado"
              : "Preventiva de Equipamento Próprio"
          : "Preventiva de Equipamento de Cliente",
        title: p.name,
        name: e.name,
        customer: rental?.customer || e.customer,
        state: f.status,
        alert: ["soon", "due", "overdue"].includes(f.status),
        resolved:
          hierarchy && p.hours
            ? hourly.every(
                (p) =>
                  !p.forecast.incomplete &&
                  !p.forecast.inconsistent &&
                  p.forecast.status === "scheduled",
              )
            : reliable && f.status === "scheduled",
        priority: ["due", "overdue"].includes(f.status) ? "urgent" : "normal",
        due: f.due || null,
      });
    }
  }
  return result;
}
