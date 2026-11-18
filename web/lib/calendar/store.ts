import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import type { CalendarEvent } from "./model";
export class CalendarInputError extends Error {}
function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T12:00:00Z")) ||
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw new CalendarInputError("Período inválido.");
  return value;
}
export async function calendarEvents(
  email: string,
  start: string,
  end: string,
  db: any = database(),
) {
  date(start);
  date(end);
  if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 92)
    throw new CalendarInputError("Selecione um período de até 93 dias.");
  email = email.toLowerCase();
  const user = (
    await db.query(
      "SELECT enabled,role,display_name FROM web_user_access WHERE email=$1",
      [email],
    )
  ).rows[0];
  if (!user?.enabled) throw new Forbidden();
  // Project the live source records. No duplicated appointments or role/job-title gate:
  // the same person may be both seller and technician. Scope remains personal.
  const operations = (
    await db.query(
      `SELECT p.id::text,p.position,p.status,p.document->>'date' AS day,p.document->>'time' AS time,p.document->>'description' description,
 COALESCE(o.numero_sequencia,o.id_m8)::text number,o.cliente_nome customer,p.schedule_id::text,
 COALESCE(p.document->'technicianClosures' ? $1,false) technician_closed
 FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id
 JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
 WHERE s.active AND p.sent_at IS NOT NULL AND (p.document->>'responsible'=$1 OR p.document->'support' ? $1)
 AND p.document->>'date' BETWEEN $2 AND $3`,
      [email, start, end],
    )
  ).rows;
  const visits = (
    await db.query(
      `SELECT v.id::text,to_char(v.scheduled_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,
 to_char(v.scheduled_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') AS time,v.status,v.description,p.name purpose,
 COALESCE(l.name,c.name,v.customer_key) customer
 FROM web_sales_visits v LEFT JOIN web_sales_visit_purposes p ON p.id=v.purpose_id
 LEFT JOIN web_sales_leads l ON 'lead:'||l.id::text=v.customer_key
 LEFT JOIN LATERAL(SELECT d.name FROM m8_customer_directory d WHERE 'm8:'||d.person_id::text=v.customer_key ORDER BY d.collected_at DESC,d.company_id LIMIT 1)c ON true
 WHERE v.seller=$1 AND v.scheduled_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
 AND v.scheduled_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
      [email, start, end],
    )
  ).rows;
  const tasks = (
    await db.query(
      `SELECT t.id::text,t.due_date::text AS day,t.title,t.customer,t.status,t.equipment_name description
 FROM web_tasks t WHERE (t.assigned_to=$1 OR $1=ANY(COALESCE(t.followers,'{}'::text[])))
 AND (COALESCE(to_jsonb(t)->>'restricted','false')<>'true' OR $4::boolean)
 AND t.due_date BETWEEN $2::date AND $3::date`,
      [email, start, end, user.role === "admin"],
    )
  ).rows;
  const events: CalendarEvent[] = [
    ...operations.map((r: any) => ({
      id: "operation:" + r.id,
      source: "operations",
      sourceId: r.id,
      day: r.day,
      time: (r.time || "").slice(0, 5),
      title: `OS ${r.number} · Operação ${String(r.position).padStart(2, "0")}`,
      customer: r.customer || "",
      description: r.description || "",
      status: r.status,
      state:
        r.technician_closed ||
        ["awaiting_review", "reviewed", "completed"].includes(r.status)
          ? "completed"
          : "pending",
      href: "/tecnico?operation=" + encodeURIComponent(r.id),
    })),
    ...visits.map((r: any) => ({
      id: "visit:" + r.id,
      source: "visits",
      sourceId: r.id,
      day: r.day,
      time: r.time,
      title: r.purpose || "Visita comercial",
      customer: r.customer || "",
      description: r.description || "",
      status: r.status,
      state:
        r.status === "completed"
          ? "completed"
          : r.status === "cancelled"
            ? "cancelled"
            : "pending",
      href: "/visitas?visit=" + encodeURIComponent(r.id),
    })),
    ...tasks.map((r: any) => ({
      id: "task:" + r.id,
      source: "tasks",
      sourceId: r.id,
      day: r.day,
      time: "",
      title: `TAR-${r.id} · ${r.title}`,
      customer: r.customer || "",
      description: r.description || "",
      status: r.status,
      state: r.status === "completed" ? "completed" : "pending",
      href: "/tarefas?task=" + encodeURIComponent(r.id),
    })),
  ];
  return {
    email,
    name: user.display_name || email,
    start,
    end,
    events,
    updatedAt: new Date().toISOString(),
  };
}
