import { operationCalendarAllocation } from "./calendar";
import {timeRequestsAvailable} from "./time-request-availability";
import {reviewChecklist} from "./checklist-review";
import "server-only";
import {updateChecklist,prepareChecklistSubmission,reopenReport} from "./checklist-store";
import {stagesOf} from "./checklists";
import {validateAutomaticRules} from "./automatic-rules";
import { combineOrderItems } from "./linked-items";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { orderDetail } from "../history";
import { Forbidden } from "../auth";
import {
  blankOperation,
  scheduleStatus,
  planningStatus,
  validateOperation,
  validateSettings,
  calendarEnd,
} from "./model";
export class ScheduleInputError extends Error {}
export class ScheduleConflict extends Error {}
const id = (v: any) => {
  if (typeof v !== "string" || !/^\d{1,18}$/.test(v))
    throw new ScheduleInputError("Identificador inválido.");
  return v;
};
const uuid = (v: any) => {
  if (
    typeof v !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    throw new ScheduleInputError("Operação inválida.");
  return v;
};
const amount = (v: any, max = 1e9) => {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max)
    throw new ScheduleInputError("Quantidade ou custo inválido.");
  return v;
};
async function access(c: any, email: string) {
  const a = (
    await c.query(
      "SELECT role,enabled FROM web_user_access WHERE email=$1 FOR SHARE",
      [email],
    )
  ).rows[0];
  if (!a?.enabled) throw new Forbidden();
  return a.role === "admin";
}
async function audit(c: any, email: string, event: string, details: any) {
  await c.query(
    "INSERT INTO web_access_events(event,email,actor,details) VALUES($1,$2,$2,$3)",
    [event, email, JSON.stringify(details)],
  );
}
export async function schedulingData(scheduleId: string | null, email: string) {
  const db = database();
  const user = (
    await db.query("SELECT role,enabled FROM web_user_access WHERE email=$1", [
      email,
    ])
  ).rows[0];
  if (!user?.enabled) throw new Forbidden();
  const settings = (
    await db.query("SELECT * FROM web_service_schedule_settings WHERE id=1")
  ).rows[0];
  const users = (
    await db.query(
      "SELECT email,display_name,job_title,enabled,hourly_cost FROM web_user_access ORDER BY display_name,email",
    )
  ).rows;
  const automaticOptions = (await db.query(`SELECT
    array_agg(DISTINCT status_lancamento_nome ORDER BY status_lancamento_nome) FILTER(WHERE nullif(status_lancamento_nome,'') IS NOT NULL) AS status_lancamento_nome,
    array_agg(DISTINCT tipo_nome ORDER BY tipo_nome) FILTER(WHERE nullif(tipo_nome,'') IS NOT NULL) AS tipo_nome,
    array_agg(DISTINCT situacao_nome ORDER BY situacao_nome) FILTER(WHERE nullif(situacao_nome,'') IS NOT NULL) AS situacao_nome,
    array_agg(DISTINCT tipo_atendimento_nome ORDER BY tipo_atendimento_nome) FILTER(WHERE nullif(tipo_atendimento_nome,'') IS NOT NULL) AS tipo_atendimento_nome
    FROM m8_ordens_servico WHERE company_id IN(1,2,27404)`)).rows[0];
  const base = {
    settings,
    automaticOptions,
    users,
    canEditSettings: user.role === "admin",
    email,
  };
  if (!scheduleId) {
    const schedules = (
      await db.query(
        `SELECT s.*,customer.payload->>'municipioNome' AS customer_city,customer.payload->>'ufSigla' AS customer_state,o.numero_sequencia,o.cliente_nome,o.equipamento,o.tipo_nome,o.tipo_atendimento_nome,o.status_lancamento_nome,linked.status_lancamento_nome AS linked_status_lancamento_nome,linked.id_m8 AS linked_order_id,linked.numero_sequencia AS linked_order_number,o.status order_status,(SELECT count(*)::int FROM web_service_operations p WHERE p.schedule_id=s.id) operation_count,
        COALESCE((SELECT jsonb_object_agg(c.status,c.n) FROM (SELECT p.status,count(*)::int n FROM web_service_operations p WHERE p.schedule_id=s.id GROUP BY p.status) c),'{}'::jsonb) operation_status_counts,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('date',p.document->>'date','time',p.document->>'time','duration',p.document->'duration','calendarId',p.document->>'calendarId','responsibleEmail',p.document->>'responsible','support',COALESCE(p.document->'support','[]'::jsonb),'responsible',COALESCE(NULLIF(u.display_name,''),p.document->>'responsible')) ORDER BY p.document->>'time',p.position) FROM web_service_operations p LEFT JOIN web_user_access u ON u.email=p.document->>'responsible' WHERE p.schedule_id=s.id),'[]'::jsonb) calendar_operations
        FROM web_service_schedules s LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id LEFT JOIN m8_customer_directory customer ON customer.company_id=o.company_id AND customer.person_id=o.cliente_id LEFT JOIN web_order_links ol ON ol.company_id=s.company_id AND ol.order_id=s.order_id LEFT JOIN m8_ordens_servico linked ON linked.company_id=ol.linked_company_id AND linked.id_m8=ol.linked_order_id WHERE s.active ORDER BY s.created_at DESC,s.id DESC`,
      )
    ).rows;
    return {
      ...base,
      schedules: schedules.map((s) => ({
        ...s,
        programming_status: scheduleStatus(s.operation_status_counts),
        calendar_operations: (s.calendar_operations || []).map((operation: any) => {
          const allocation = operationCalendarAllocation(operation, settings.document.calendars.find((calendar: any) => calendar.id === (operation.calendarId || "standard")));
          return { ...operation, allocation, dates: allocation.length ? allocation.map(day => day.date) : [operation.date || ""] };
        }),
      })),
    };
  }
  const schedule = (
    await db.query(`SELECT s.*,c.payload->>'municipioNome' AS customer_city,c.payload->>'ufSigla' AS customer_state
      FROM web_service_schedules s
      LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
      LEFT JOIN m8_customer_directory c ON c.company_id=o.company_id AND c.person_id=o.cliente_id
      WHERE s.id=$1`, [
      id(scheduleId),
    ])
  ).rows[0];
  if (!schedule) throw new ScheduleInputError("Programação não encontrada.");
  const timeAdjustmentsAvailable=await timeRequestsAvailable(db);
  const [detail, operations, usage, costs, events, profit, fieldSessions, fieldEvents, timeRequests] = await Promise.all([
    orderDetail(String(schedule.company_id), String(schedule.order_id)),
    db.query(
      "SELECT * FROM web_service_operations WHERE schedule_id=$1 ORDER BY position",
      [scheduleId],
    ),
    db.query("SELECT * FROM web_service_item_usage WHERE schedule_id=$1", [
      scheduleId,
    ]),
    db.query("SELECT * FROM web_service_item_cost WHERE schedule_id=$1", [
      scheduleId,
    ]),
    db.query(
      "SELECT e.*,u.display_name FROM web_service_operation_events e JOIN web_service_operations p ON p.id=e.operation_id LEFT JOIN web_user_access u ON u.email=e.actor WHERE p.schedule_id=$1 ORDER BY e.created_at DESC",
      [scheduleId],
    ),
    db.query(
      "SELECT document FROM web_order_profit WHERE company_id=$1 AND order_id=$2",
      [schedule.company_id, schedule.order_id],
    ),
    db.query("SELECT f.*,u.display_name FROM web_field_sessions f JOIN web_service_operations p ON p.id=f.operation_id LEFT JOIN web_user_access u ON u.email=f.actor WHERE p.schedule_id=$1 ORDER BY f.started_at DESC,f.id",[scheduleId]),
    db.query("SELECT e.id,e.operation_id,e.actor,e.action,e.created_at,e.document,e.latitude,e.longitude FROM web_field_events e JOIN web_service_operations p ON p.id=e.operation_id WHERE p.schedule_id=$1 AND e.action IN ('start_work','start_travel','pause','resume','stop') ORDER BY e.created_at,e.id",[scheduleId]),
    timeAdjustmentsAvailable ? db.query("SELECT r.*,u.display_name reviewer_name,a.display_name actor_name FROM web_field_time_requests r JOIN web_service_operations p ON p.id=r.operation_id LEFT JOIN web_user_access u ON u.email=r.reviewed_by LEFT JOIN web_user_access a ON a.email=r.actor WHERE p.schedule_id=$1 ORDER BY r.created_at DESC",[scheduleId]) : Promise.resolve({rows:[]}),
  ]);
  const link = (await db.query("SELECT linked_company_id,linked_order_id FROM web_order_links WHERE company_id=$1 AND order_id=$2",[schedule.company_id,schedule.order_id])).rows[0];
  const linkedDetail = link?.linked_order_id ? await orderDetail(String(link.linked_company_id),String(link.linked_order_id)) : null;
  const linkedProfit = link?.linked_order_id ? (await db.query("SELECT document FROM web_order_profit WHERE company_id=$1 AND order_id=$2",[link.linked_company_id,link.linked_order_id])).rows[0]?.document || null : null;
  const combinedDetail = detail ? {...detail,
    materials:combineOrderItems(detail,linkedDetail,"materials",schedule.company_id,schedule.order_id,link?.linked_company_id,link?.linked_order_id),
    services:combineOrderItems(detail,linkedDetail,"services",schedule.company_id,schedule.order_id,link?.linked_company_id,link?.linked_order_id).map((item: any) => ({...item,source_profit:item.source_linked ? linkedProfit : profit.rows[0]?.document || null}))
  } : detail;
  return {
    ...base,
    schedule,
    detail: combinedDetail,
    linked_detail_incomplete: !!link?.linked_order_id && !linkedDetail?.detail_at,
    operations: operations.rows,
    timeAdjustmentsAvailable,
    requests: timeRequests.rows,
    fieldSessions: fieldSessions.rows,
    fieldEvents: fieldEvents.rows,
    usage: usage.rows,
    costs: costs.rows,
    events: events.rows,
    profit: profit.rows[0]?.document || null,
  };
}
export async function scheduleForOrder(company: string, orderId: string) {
  if (!["1", "2", "27404"].includes(company)) throw new ScheduleInputError("Empresa inválida.");
  id(orderId);
  return { schedule: (await database().query("SELECT id,active FROM web_service_schedules WHERE company_id=$1 AND order_id=$2", [company,orderId])).rows[0] || null };
}
export async function mutateSchedule(b: any, email: string) {
  if (!b || typeof b.action !== "string")
    throw new ScheduleInputError("Ação inválida.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const admin = await access(c, email);
    // Settings and operations serialize to ensure an operation never references a removed definition.
    await c.query("SELECT pg_advisory_xact_lock(728001)");
    const config = (
      await c.query("SELECT * FROM web_service_schedule_settings WHERE id=1")
    ).rows[0];
    if (b.action === "automatic_preview") {
      if(!admin) throw new Forbidden();
      let rules;
      try { rules=validateAutomaticRules({...b.document,enabled:true}); } catch(e) { throw new ScheduleInputError((e as Error).message); }
      const preview = (await c.query(`SELECT count(*)::int AS matching
        FROM m8_ordens_servico o WHERE o.company_id IN(1,2,27404) AND web_schedule_rule_matches(to_jsonb(o),$1::jsonb)`,[JSON.stringify(rules)])).rows[0];
      await c.query("COMMIT");return {preview};
    }
    if (b.action === "settings") {
      if (!admin) throw new Forbidden();
      if (b.version !== config.version)
        throw new ScheduleConflict("Configuração alterada. Atualize a página.");
      let document;
      try {
        document = validateSettings(b.document);
      } catch (e) {
        throw new ScheduleInputError((e as Error).message);
      }
      const refs = (await c.query("SELECT * FROM web_service_operations")).rows;
      for (const { document: d } of refs)
        if (
          (d.vehicleId &&
            !document.vehicles.some((v: any) => v.id === d.vehicleId)) ||
          (d.serviceType && !document.serviceTypes.includes(d.serviceType)) ||
          (d.calendarId &&
            !document.calendars.some((v: any) => v.id === d.calendarId)) ||
          (d.checklistId &&
            !document.checklists.some((v: any) => v.id === d.checklistId))
        )
          throw new ScheduleInputError(
            "Não remova configurações utilizadas por operações.",
          );
      const result = (
        await c.query(
          "UPDATE web_service_schedule_settings SET document=$1,version=version+1,updated_at=now(),updated_by=$2 WHERE id=1 RETURNING *",
          [JSON.stringify(document), email],
        )
      ).rows[0];
      for (const o of refs)
        if (["pending", "planning", "scheduled"].includes(o.status)) {
          const ends = calendarEnd(
            o.document,
            document.calendars.find(
              (cal: any) => cal.id === o.document.calendarId,
            ),
          );
          await c.query(
            "UPDATE web_service_operations SET ends_at=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1",
            [o.id, ends, email],
          );
        }
      await audit(c, email, "service_schedule_settings", {
        before: config.document,
        after: document,
      });
      await c.query("COMMIT");
      return { settings: result };
    }
    if (b.action === "include" || b.action === "remove_schedule") {
      const company = String(b.company);
      if (!["1", "2", "27404"].includes(company))
        throw new ScheduleInputError("Empresa inválida.");
      id(b.orderId);
      if (
        !(
          await c.query(
            "SELECT id_m8 FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",
            [company, b.orderId],
          )
        ).rows.length
      )
        throw new ScheduleInputError("OS não encontrada.");
      if (b.action === "remove_schedule") {
        if((await c.query("SELECT 1 FROM web_field_sessions f JOIN web_service_operations p ON p.id=f.operation_id JOIN web_service_schedules s ON s.id=p.schedule_id WHERE s.company_id=$1 AND s.order_id=$2 AND f.state<>'finished'",[company,b.orderId])).rows.length)throw new ScheduleInputError("Finalize os apontamentos ativos antes de remover a programação.");
        const schedule = (await c.query("UPDATE web_service_schedules SET active=false WHERE company_id=$1 AND order_id=$2 RETURNING *", [company,b.orderId])).rows[0];
        if (!schedule) throw new ScheduleInputError("Programação não encontrada.");
        await audit(c,email,"service_schedule_removed",{schedule});
        await c.query("COMMIT");
        return {schedule};
      }
      let schedule = (
        await c.query(
          "INSERT INTO web_service_schedules(company_id,order_id,created_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *",
          [company, b.orderId, email],
        )
      ).rows[0];
      if (schedule) {
        for (let position = 1; position <= 1; position++)
          await c.query(
            "INSERT INTO web_service_operations(id,schedule_id,position,document,updated_by) VALUES($1,$2,$3,$4,$5)",
            [
              randomUUID(),
              schedule.id,
              position,
              JSON.stringify(blankOperation()),
              email,
            ],
          );
        await audit(c, email, "service_schedule_included", { schedule });
      } else
        schedule = (
          await c.query(
            "SELECT * FROM web_service_schedules WHERE company_id=$1 AND order_id=$2",
            [company, b.orderId],
          )
        ).rows[0];
      if (!schedule.active) {
        schedule = (await c.query("UPDATE web_service_schedules SET active=true WHERE id=$1 RETURNING *",[schedule.id])).rows[0];
        await audit(c,email,"service_schedule_restored",{schedule});
      }
      await c.query("COMMIT");
      return { schedule };
    }
    const schedule = (
      await c.query(
        "SELECT * FROM web_service_schedules WHERE id=$1 FOR UPDATE",
        [id(b.scheduleId)],
      )
    ).rows[0];
    if (!schedule) throw new ScheduleInputError("Programação não encontrada.");
    if (b.action === "add_operation") {
      const result = (
        await c.query(
          "INSERT INTO web_service_operations(id,schedule_id,position,document,updated_by) SELECT $1,$2,coalesce(max(position),0)+1,$3,$4 FROM web_service_operations WHERE schedule_id=$2 RETURNING *",
          [randomUUID(), schedule.id, JSON.stringify(blankOperation()), email],
        )
      ).rows[0];
      await audit(c, email, "service_operation_created", {
        operation: result.id,
      });
      await c.query("COMMIT");
      return { operation: result };
    }
    if (["usage", "service_cost"].includes(b.action)) {
      id(b.itemId);
      const itemCompany = String(b.item_company ?? schedule.company_id), itemOrder = String(b.item_order ?? schedule.order_id);
      id(itemOrder);
      if(itemCompany !== String(schedule.company_id) || itemOrder !== String(schedule.order_id)) {
        const allowed = (await c.query("SELECT 1 FROM web_order_links WHERE company_id=$1 AND order_id=$2 AND linked_company_id=$3 AND linked_order_id=$4 FOR SHARE",[schedule.company_id,schedule.order_id,itemCompany,itemOrder])).rows.length;
        if(!allowed) throw new ScheduleInputError("O item não pertence à OS nem à OS vinculada.");
      }
      const table = b.action === "usage" ? "m8_os_produtos" : "m8_os_servicos";
      const item = (
        await c.query(
          `SELECT * FROM ${table} WHERE company_id=$1 AND ordem_servico_id=$2 AND id_m8=$3`,
          [itemCompany, itemOrder, b.itemId],
        )
      ).rows[0];
      if (!item || item.esta_excluido === true)
        throw new ScheduleInputError("Item não disponível nesta OS.");
      if (
        b.action === "usage" &&
        !admin &&
        !(
          await c.query(
            "SELECT id FROM web_service_operations WHERE schedule_id=$1 AND (document->>'responsible'=$2 OR document->'support' ? $2) AND status<>'completed'",
            [schedule.id, email],
          )
        ).rows.length
      )
        throw new Forbidden();
      const target =
        b.action === "usage"
          ? "web_service_item_usage"
          : "web_service_item_cost";
      const old = (
        await c.query(
          `SELECT * FROM ${target} WHERE schedule_id=$1 AND item_id=$2 AND item_company=$3 AND item_order=$4 FOR UPDATE`,
          [schedule.id, b.itemId, itemCompany, itemOrder],
        )
      ).rows[0];
      if ((old?.version ?? null) !== b.version)
        throw new ScheduleConflict("Item alterado. Atualize a página.");
      let result;
      if (b.action === "usage")
        result = (
          await c.query(
            "INSERT INTO web_service_item_usage(schedule_id,item_id,withdrawn,used,updated_by,item_company,item_order) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(schedule_id,item_company,item_order,item_id) DO UPDATE SET withdrawn=$3,used=$4,updated_by=$5,updated_at=now(),version=web_service_item_usage.version+1 RETURNING *",
            [schedule.id, b.itemId, amount(b.withdrawn), amount(b.used), email,itemCompany,itemOrder],
          )
        ).rows[0];
      else
        result = (
          await c.query(
            "INSERT INTO web_service_item_cost(schedule_id,item_id,cost,updated_by,item_company,item_order) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(schedule_id,item_company,item_order,item_id) DO UPDATE SET cost=$3,updated_by=$4,version=web_service_item_cost.version+1 RETURNING *",
            [schedule.id, b.itemId, amount(b.cost), email,itemCompany,itemOrder],
          )
        ).rows[0];
      await audit(c, email, "service_schedule_" + b.action, {
        schedule_id: schedule.id,
        item_id: b.itemId,
        before: old,
        after: result,
      });
      await c.query("COMMIT");
      return { item: result };
    }
    const operation = (
      await c.query(
        "SELECT * FROM web_service_operations WHERE id=$1 AND schedule_id=$2 FOR UPDATE",
        [uuid(b.operationId), schedule.id],
      )
    ).rows[0];
    if (!operation) throw new ScheduleInputError("Operação não encontrada.");
    if (operation.version !== b.version)
      throw new ScheduleConflict(
        "Operação alterada por outro usuário. Atualize a página.",
      );
    if (operation.status === "completed")
      throw new ScheduleInputError("Operação concluída não pode ser alterada.");
    if(b.action==='report_reopen'){
      let result;
      try{result=await reopenReport(c,operation,email,admin);}catch(e){throw new ScheduleInputError((e as Error).message);}
      await c.query('COMMIT');return {operation:result};
    }
    if (b.action.startsWith("checklist_")) {
      let result;
      try {result=await updateChecklist(c,b,operation,schedule,config.document,email,admin);}
      catch(e){throw new ScheduleInputError((e as Error).message);}
      await c.query("COMMIT");return {operation:result};
    }
    if (b.action === "remove_operation") {
      if (!["pending", "planning", "scheduled"].includes(operation.status))
        throw new ScheduleInputError(
          "Não é possível remover uma operação em execução ou revisão.",
        );
      await audit(c, email, "service_operation_removed", {
        operation,
        events: (
          await c.query(
            "SELECT * FROM web_service_operation_events WHERE operation_id=$1",
            [operation.id],
          )
        ).rows,
      });
      await c.query(
        "DELETE FROM web_service_operation_events WHERE operation_id=$1",
        [operation.id],
      );
      await c.query("DELETE FROM web_service_operations WHERE id=$1", [
        operation.id,
      ]);
      await c.query("COMMIT");
      return { removed: operation.id };
    }
    let document = operation.document,
      status = operation.status,
      ends = operation.ends_at,
      hours = null;
    const assigned =
      document.responsible === email || document.support?.includes(email);
    if (b.action === "dispatch") {
      if(!admin) throw new Forbidden();
      if(status!=="scheduled" || !document.responsible || !document.date || !document.time) throw new ScheduleInputError("Salve a data, a hora e o responsável antes de enviar a operação.");
      const enabled=(await c.query("SELECT email FROM web_user_access WHERE enabled AND email=$1",[document.responsible])).rows.length;
      if(!enabled)throw new ScheduleInputError("O responsável precisa estar ativo.");
      if(document.checklistId&&!document.checklistRun){
        const template=config.document.checklists.find((v:any)=>v.id===document.checklistId);
        if(!template)throw new ScheduleInputError("Checklist não encontrado.");
        const now=new Date().toISOString();
        document={...document,checklistRun:{template:structuredClone(template),equipmentId:'',meterDate:'',stages:Object.fromEntries(stagesOf(template).map(s=>[s.id,{status:'released',answers:{},releasedAt:now,releasedBy:email}]))}};
      }
      if(document.checklistRun){
        const run=structuredClone(document.checklistRun);
        for(const stage of stagesOf(run.template))if(!run.stages[stage.id]||run.stages[stage.id].status==='pending')run.stages[stage.id]={...run.stages[stage.id],status:'released',answers:run.stages[stage.id]?.answers||{},releasedAt:new Date().toISOString(),releasedBy:email};
        document={...document,checklistRun:run};
      }
      await c.query("UPDATE web_service_operations SET sent_at=now() WHERE id=$1",[operation.id]);
      status="awaiting_execution";
    } else if (b.action === "operation") {
      if (["awaiting_review", "reviewed"].includes(status))
        throw new ScheduleInputError("A operação está em revisão.");
      const users = (
        await c.query("SELECT email,job_title,enabled FROM web_user_access")
      ).rows;
      try {
        if (operation.document.checklistRun && b.document.checklistId !== operation.document.checklistId)
          throw Error("O checklist já foi iniciado e não pode ser substituído.");
        if(operation.sent_at && (b.document.responsible!==operation.document.responsible || JSON.stringify(b.document.support)!==JSON.stringify(operation.document.support) || b.document.vehicleId!==operation.document.vehicleId) && (await c.query("SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND state<>'finished'",[operation.id])).rows.length)throw Error("Finalize os apontamentos ativos antes de alterar a equipe ou o veículo.");
        const checked = validateOperation({...b.document, checklistRun: operation.document.checklistRun}, config.document, users);
        document = checked.document;
        ends = checked.ends_at;
      } catch (e) {
        throw new ScheduleInputError((e as Error).message);
      }
      if (["pending", "planning", "scheduled"].includes(status))
        status = planningStatus(document);
      if (
        JSON.stringify(document.checked) !==
        JSON.stringify(operation.document.checked)
      ) {
        if (!admin && !assigned) throw new Forbidden();
        status = "executing";
      }
    } else if (b.action === "work_log" || b.action === "activity") {
      if (!admin && !assigned) throw new Forbidden();
      if (["awaiting_review", "reviewed"].includes(status))
        throw new ScheduleInputError("Operação já finalizada.");
      if (b.action === "work_log") {
        hours = amount(b.hours, 10000);
        if (!hours)
          throw new ScheduleInputError("Informe horas maiores que zero.");
      }
      status = "executing";
    } else if (["finish_partial", "finish_full"].includes(b.action)) {
      if (!admin && document.responsible !== email) throw new Forbidden();
      if (status !== "executing")
        throw new ScheduleInputError("Inicie a execução antes de finalizar.");
      if(b.action === "finish_full" && document.checklistId) {
        const run=document.checklistRun;
        const template=run?.template || config.document.checklists.find((t:any)=>t.id===document.checklistId);
        if(template?.stages) {
          try { document={...document,checklistRun:prepareChecklistSubmission(run,email)}; }
          catch(e){throw new ScheduleInputError((e as Error).message);}
        }
      }
      if(operation.sent_at && (await c.query("SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND state<>'finished'",[operation.id])).rows.length)throw new ScheduleInputError("Finalize os apontamentos da equipe antes de enviar a operação.");
      status = b.action === "finish_full" ? "awaiting_review" : "executing";
    } else if (b.action === "review") {
      if (!admin) throw new Forbidden();
      if (status !== "awaiting_review")
        throw new ScheduleInputError("A operação ainda não aguarda revisão.");
      try { document=await reviewChecklist(c,operation,schedule,config.document,email); }
      catch(e){throw new ScheduleInputError((e as Error).message);}
      status = "reviewed";
    } else if (b.action === "complete") {
      if (!admin) throw new Forbidden();
      if (status !== "reviewed")
        throw new ScheduleInputError("Revise a operação antes de concluir.");
      status = "completed";
    } else throw new ScheduleInputError("Ação inválida.");
    const result = (
      await c.query(
        "UPDATE web_service_operations SET document=$2,status=$3,ends_at=$4,version=version+1,updated_at=now(),updated_by=$5 WHERE id=$1 RETURNING *",
        [operation.id, JSON.stringify(document), status, ends, email],
      )
    ).rows[0];
    if (
      typeof b.description !== "undefined" &&
      (typeof b.description !== "string" || b.description.length > 2000)
    )
      throw new ScheduleInputError("Observação limitada a 2.000 caracteres.");
    await c.query(
      "INSERT INTO web_service_operation_events(operation_id,action,hours,actor,description) VALUES($1,$2,$3,$4,$5)",
      [operation.id, b.action, hours, email, b.description || ""],
    );
    await audit(c, email, "service_operation_" + b.action, {
      id: operation.id,
      before: operation,
      after: result,
    });
    await c.query(
      `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) SELECT id,'Operação da OS atualizada',$3,false,$4,coalesce((SELECT display_name FROM web_user_access WHERE email=$4),'Usuário') FROM web_tasks WHERE order_company=$1 AND order_id=$2 AND status<>'completed'`,
      [
        schedule.company_id,
        schedule.order_id,
        `Operação ${operation.position}: ${document.description || "Sem descrição"}. Ação: ${b.action}.`,
        email,
      ],
    );
    await c.query(
      "UPDATE web_tasks SET version=version+1,updated_at=now(),updated_by=$3 WHERE order_company=$1 AND order_id=$2 AND status<>'completed'",
      [schedule.company_id, schedule.order_id, email],
    );
    await c.query("COMMIT");
    return { operation: result };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
