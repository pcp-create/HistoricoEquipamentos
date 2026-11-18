import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import {shiftDay} from "./model";
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
  employee?: string,
  includeAppointments = false,
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
  const employees = (await db.query("SELECT email AS id,COALESCE(NULLIF(display_name,''),email) AS name FROM web_user_access WHERE enabled ORDER BY display_name,email")).rows;
  const selected = employee && employee !== 'me' ? employee.toLowerCase() : email;
  if(selected !== 'all' && selected !== email && !employees.some((u:any)=>u.id===selected))throw new CalendarInputError('Funcionário inválido.');
  const scope = selected === 'all' ? null : selected;
  // Project the live source records. No duplicated appointments or role/job-title gate:
  // the same person may be both seller and technician. Explicit employee filters enable the team calendar.
  const operations = (
    await db.query(
      `SELECT p.id::text,p.position,p.status,p.document->>'date' AS day,p.document->>'time' AS time,p.document->>'description' description,
 COALESCE(o.numero_sequencia,o.id_m8)::text number,o.cliente_nome customer,p.schedule_id::text,
 COALESCE(p.document->'technicianClosures' ? $1,false) technician_closed, p.document->>'responsible' employee
 FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id
 JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
 WHERE s.active AND p.sent_at IS NOT NULL AND ($1::text IS NULL OR p.document->>'responsible'=$1 OR p.document->'support' ? $1)
 AND p.document->>'date' BETWEEN $2 AND $3`,
      [scope, start, end],
    )
  ).rows;
  const visits = (
    await db.query(
      `SELECT v.id::text,to_char(v.scheduled_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,
 to_char(v.scheduled_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI') AS time,v.status,v.description,v.seller employee,p.name purpose,
 COALESCE(l.name,c.name,v.customer_key) customer
 FROM web_sales_visits v LEFT JOIN web_sales_visit_purposes p ON p.id=v.purpose_id
 LEFT JOIN web_sales_leads l ON 'lead:'||l.id::text=v.customer_key
 LEFT JOIN LATERAL(SELECT d.name FROM m8_customer_directory d WHERE 'm8:'||d.person_id::text=v.customer_key ORDER BY d.collected_at DESC,d.company_id LIMIT 1)c ON true
 WHERE ($1::text IS NULL OR v.seller=$1) AND v.scheduled_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
 AND v.scheduled_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
      [scope, start, end],
    )
  ).rows;
  const tasks = (
    await db.query(
      `SELECT t.id::text,t.due_date::text AS day,t.title,t.customer,t.status,t.equipment_name description,t.assigned_to employee
 FROM web_tasks t WHERE ($1::text IS NULL OR t.assigned_to=$1 OR $1=ANY(COALESCE(t.followers,'{}'::text[])))
 AND (COALESCE(to_jsonb(t)->>'restricted','false')<>'true' OR $4::boolean)
 AND t.due_date BETWEEN $2::date AND $3::date`,
      [scope, start, end, user.role === "admin"],
    )
  ).rows;
  const events: CalendarEvent[] = [
    ...operations.map((r: any) => ({
      id: "operation:" + r.id,
      source: "operations",
      sourceId: r.id,
      employee: employees.find((u:any)=>u.id===r.employee)?.name || r.employee || "",
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
      href: employee && employee!=="me" && employee!==email ? "/programacao?id="+encodeURIComponent(r.schedule_id) : "/tecnico?operation=" + encodeURIComponent(r.id),
    })),
    ...visits.map((r: any) => ({
      id: "visit:" + r.id,
      source: "visits",
      sourceId: r.id,
      employee: employees.find((u:any)=>u.id===r.employee)?.name || r.employee || "",
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
      employee: employees.find((u:any)=>u.id===r.employee)?.name || r.employee || "",
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
  const appointments=includeAppointments ? (await db.query(`SELECT a.*,to_char(starts_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI') AS start,
 to_char(ends_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI') AS end
 FROM web_calendar_appointments a WHERE cancelled_at IS NULL AND ($1::text IS NULL OR owner=$1)
 AND (visibility='team' OR owner=$4) AND starts_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
 AND ends_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`,[scope,start,end,email])).rows : [];
  for(const r of appointments){
   const first=r.start.slice(0,10)>start?r.start.slice(0,10):start,last=r.end.slice(0,10)<end?r.end.slice(0,10):end;
   for(let day=first;day<=last;day=shiftDay(day,1))events.push({id:'appointment:'+r.id+':'+day,source:'appointments',sourceId:r.id,day,time:r.all_day?'':r.start.slice(11),title:r.title,customer:'',description:r.description,status:'scheduled',state:'pending',href:'/calendario',employee:employees.find((u:any)=>u.id===r.owner)?.name||r.owner,appointment:{owner:r.owner,kind:r.kind,start:r.start,end:r.end,allDay:r.all_day,visibility:r.visibility,version:r.version,editable:r.owner===email||user.role==='admin'}});
  }
  return {
    canManageAppointments: user.role==='admin',
    email,
    employees,
    name: user.display_name || email,
    start,
    end,
    events,
    updatedAt: new Date().toISOString(),
  };
}
