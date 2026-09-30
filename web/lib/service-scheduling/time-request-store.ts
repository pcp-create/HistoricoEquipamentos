import { operationNumber } from "./operation-number";
import "server-only";
import {timeRequestsAvailable} from "./time-request-availability";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { Forbidden } from "../auth";
import { locationOf } from "./field-model";
import { validateTimeAdjustment } from "./time-adjustment";
export class TimeRequestError extends Error {}
const uuid = (v: any) => {
  if (
    typeof v !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    throw new TimeRequestError("Registro inválido.");
  return v;
};
const reason = (v: any) => {
  if (typeof v !== "string" || !v.trim() || v.length > 2000)
    throw new TimeRequestError("Informe o motivo (até 2.000 caracteres).");
  return v.trim();
};
export async function personalTimeLogs(email: string) {
  const db = database();
  const timeAdjustmentsAvailable=await timeRequestsAvailable(db);
  const [sessions, events, requests, operations, manualEvents] =
    await Promise.all([
      db.query(
        "SELECT f.*,u.display_name FROM web_field_sessions f LEFT JOIN web_user_access u ON u.email=f.actor WHERE f.actor=$1 ORDER BY f.started_at DESC",
        [email],
      ),
      db.query(
        "SELECT * FROM web_field_events WHERE actor=$1 AND action IN ('start_work','start_travel','pause','resume','stop') ORDER BY created_at,id",
        [email],
      ),
      timeAdjustmentsAvailable ? db.query(
        "SELECT r.*,u.display_name reviewer_name FROM web_field_time_requests r LEFT JOIN web_user_access u ON u.email=r.reviewed_by WHERE r.actor=$1 ORDER BY r.created_at DESC",
        [email],
      ) : Promise.resolve({rows:[]}),
      db.query(
        `SELECT p.*,o.numero_sequencia order_number,o.cliente_nome customer FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id WHERE EXISTS(SELECT 1 FROM web_field_sessions f WHERE f.operation_id=p.id AND f.actor=$1) OR EXISTS(SELECT 1 FROM web_service_operation_events e WHERE e.operation_id=p.id AND e.actor=$1 AND e.action IN ('work_log','travel_log')) OR (s.active AND p.sent_at IS NOT NULL AND (p.document->>'responsible'=$1 OR p.document->'support' ? $1)) ORDER BY s.created_at DESC,p.position`,
        [email],
      ),
      db.query(
        "SELECT e.*,u.display_name FROM web_service_operation_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE e.actor=$1 AND e.action IN ('work_log','travel_log')",
        [email],
      ),
    ]);
  return {
    timeAdjustmentsAvailable,
    fieldSessions: sessions.rows,
    fieldEvents: events.rows,
    requests: requests.rows,
    operations: operations.rows,
    events: manualEvents.rows,
  };
}
async function apply(c: any, r: any, reviewer: string) {
  const p = r.proposed;
  const overlap = await c.query(
    "SELECT id FROM web_field_sessions WHERE actor=$1 AND ($2::uuid IS NULL OR id<>$2) AND COALESCE((correction->>'started_at')::timestamptz,started_at)<$4::timestamptz AND COALESCE((correction->>'finished_at')::timestamptz,finished_at,'infinity'::timestamptz)>$3::timestamptz",
    [r.actor, r.session_id || null, p.started_at, p.finished_at],
  );
  if (overlap.rows.length)
    throw new TimeRequestError(
      "O horário coincide com outro apontamento da pessoa. Rejeite a solicitação e solicite a correção.",
    );
  let sessionId = r.session_id;
  if (r.legacy_event_id) {
    const legacy = (
      await c.query(
        "SELECT * FROM web_service_operation_events WHERE id=$1 FOR UPDATE",
        [r.legacy_event_id],
      )
    ).rows[0];
    if (
      !legacy ||
      Number(legacy.hours) !== Number(r.original.hours) ||
      (
        await c.query(
          "SELECT 1 FROM web_field_sessions WHERE legacy_event_id=$1",
          [r.legacy_event_id],
        )
      ).rows.length
    )
      throw new TimeRequestError(
        "O apontamento original já foi alterado. Atualize a lista.",
      );
  }
  if (sessionId) {
    const s = (
      await c.query("SELECT * FROM web_field_sessions WHERE id=$1 FOR UPDATE", [
        sessionId,
      ])
    ).rows[0];
    if (
      !s ||
      s.state !== "finished" ||
      Number(s.correction_version) !== r.base_version
    )
      throw new TimeRequestError(
        "O apontamento mudou após a solicitação. Atualize e solicite novamente.",
      );
    await c.query(
      "UPDATE web_field_sessions SET correction=$2,correction_version=correction_version+1 WHERE id=$1",
      [
        sessionId,
        JSON.stringify({
          ...p,
          ...(s.correction?.manual
            ? { manual: true, requestLocation: s.correction.requestLocation }
            : {}),
        }),
      ],
    );
    if (s.legacy_event_id)
      await c.query(
        "UPDATE web_service_operation_events SET hours=$2 WHERE id=$1",
        [s.legacy_event_id, p.active_seconds / 3600],
      );
    // Preserve original timestamps; only the mirrored costing duration changes.
    await c.query(
      "UPDATE web_service_operation_events SET hours=$4 WHERE operation_id=$1 AND actor=$2 AND created_at=$3 AND action=$5",
      [
        s.operation_id,
        s.actor,
        s.finished_at,
        p.active_seconds / 3600,
        s.kind === "work" ? "work_log" : "travel_log",
      ],
    );
  } else {
    sessionId = randomUUID();
    await c.query(
      `INSERT INTO web_field_sessions(id,operation_id,actor,kind,state,started_at,finished_at,segment_at,active_seconds,pause_seconds,correction) VALUES($1,$2,$3,$4,'finished',$5,$6,$6,$7,$8,$9)`,
      [
        sessionId,
        r.operation_id,
        r.actor,
        r.kind,
        p.started_at,
        p.finished_at,
        p.active_seconds,
        p.pause_seconds,
        JSON.stringify(p),
      ],
    );
    if (r.legacy_event_id) {
      await c.query(
        "UPDATE web_service_operation_events SET hours=$2 WHERE id=$1",
        [r.legacy_event_id, p.active_seconds / 3600],
      );
      await c.query(
        "UPDATE web_field_sessions SET legacy_event_id=$2 WHERE id=$1",
        [sessionId, r.legacy_event_id],
      );
    } else
      await c.query(
        "INSERT INTO web_service_operation_events(operation_id,action,hours,actor,description,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          r.operation_id,
          r.kind === "work" ? "work_log" : "travel_log",
          p.active_seconds / 3600,
          r.actor,
          "Apontamento manual aprovado por " + reviewer,
          p.finished_at,
        ],
      );
    // This is the request location, never misrepresented as a historical activity location.
    await c.query(
      "UPDATE web_field_sessions SET correction=correction||$2::jsonb WHERE id=$1",
      [
        sessionId,
        JSON.stringify({ manual: true, requestLocation: r.location }),
      ],
    );
    await c.query(
      "UPDATE web_field_time_requests SET session_id=$2 WHERE id=$1",
      [r.id, sessionId],
    );
  }
  await c.query(
    "UPDATE web_field_time_requests SET status='approved',reviewed_by=$2,reviewed_at=now() WHERE id=$1",
    [r.id, reviewer],
  );
  await c.query(
    "INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,'time_adjustment',$2,$3)",
    [r.operation_id, reviewer, r.reason],
  );
  return sessionId;
}
export async function changeTimeRequest(b: any, email: string) {
  if(!await timeRequestsAvailable(database()))throw new TimeRequestError("As solicitações de ajuste ainda não estão habilitadas. Os apontamentos continuam disponíveis para consulta.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    // Same ordering for all adjustments/approvals; all copies of a manager task finish atomically.
    await c.query("SELECT pg_advisory_xact_lock(728001)");
    const user = (
      await c.query(
        "SELECT * FROM web_user_access WHERE email=$1 AND enabled",
        [email],
      )
    ).rows[0];
    if (!user) throw new Forbidden();
    if (b.action === "approve" || b.action === "reject") {
      const r = (
        await c.query(
          "SELECT * FROM web_field_time_requests WHERE id=$1 FOR UPDATE",
          [uuid(b.id)],
        )
      ).rows[0];
      const current = (
        await c.query("SELECT managers FROM web_user_access WHERE email=$1", [
          r?.actor || "",
        ])
      ).rows[0];
      if (
        !r ||
        r.actor === email ||
        !r.managers.includes(email) ||
        !current?.managers?.includes(email)
      )
        throw new Forbidden();
      if (r.status !== "pending")
        throw new TimeRequestError("Esta solicitação já foi analisada.");
      if (b.action === "approve") await apply(c, r, email);
      else
        await c.query(
          "UPDATE web_field_time_requests SET status='rejected',reviewed_by=$2,reviewed_at=now(),review_reason=$3 WHERE id=$1",
          [r.id, email, reason(b.reason)],
        );
      const tasks = (
        await c.query(
          "UPDATE web_tasks SET status='completed',source_status=$3,completed_at=now(),updated_at=now(),updated_by=$2,version=version+1,source_resolved=true WHERE source_key LIKE $1 RETURNING id",
          [
            "time-request:" + r.id + ":%",
            email,
            b.action === "approve" ? "Aprovado" : "Rejeitado",
          ],
        )
      ).rows;
      for (const t of tasks)
        await c.query(
          "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,false,$4,$5)",
          [
            t.id,
            b.action === "approve"
              ? "Solicitação aprovada"
              : "Solicitação rejeitada",
            b.action === "approve" ? "Horários atualizados." : b.reason,
            email,
            user.display_name || email,
          ],
        );
      await c.query("COMMIT");
      return { ok: true };
    }
    if (!["request", "planner_adjust"].includes(b.action))
      throw new TimeRequestError("Ação inválida.");
    const direct = b.action === "planner_adjust";
    if (direct && user.role !== "admin") throw new Forbidden();
    const key = uuid(b.requestId);
    const repeated = (
      await c.query(
        "SELECT id,requester FROM web_field_time_requests WHERE request_key=$1",
        [key],
      )
    ).rows[0];
    if (repeated) {
      if (repeated.requester !== email) throw new Forbidden();
      await c.query("COMMIT");
      return { ok: true, id: repeated.id };
    }
    const operation = (
      await c.query("SELECT * FROM web_service_operations WHERE id=$1", [
        uuid(b.operationId),
      ])
    ).rows[0];
    if (!operation) throw new TimeRequestError("Operação não encontrada.");
    const legacy = b.legacyEventId
      ? (
          await c.query(
            "SELECT * FROM web_service_operation_events WHERE id=$1 AND operation_id=$2 AND action IN ('work_log','travel_log')",
            [
              String(b.legacyEventId).match(/^\d{1,18}$/)?.[0] || "0",
              operation.id,
            ],
          )
        ).rows[0]
      : null;
    if (b.legacyEventId && !legacy)
      throw new TimeRequestError("Registro manual não encontrado.");
    if (
      legacy &&
      (
        await c.query(
          "SELECT 1 FROM web_field_sessions WHERE legacy_event_id=$1 OR (operation_id=$2 AND actor=$3 AND finished_at=$4)",
          [legacy.id, legacy.operation_id, legacy.actor, legacy.created_at],
        )
      ).rows.length
    )
      throw new TimeRequestError(
        "Use o apontamento correspondente na lista atualizada.",
      );
    const s = b.sessionId
      ? (
          await c.query(
            "SELECT * FROM web_field_sessions WHERE id=$1 AND operation_id=$2 FOR UPDATE",
            [uuid(b.sessionId), operation.id],
          )
        ).rows[0]
      : null;
    if (b.sessionId && !s)
      throw new TimeRequestError("Apontamento não encontrado.");
    if (direct && !s && !legacy)
      throw new TimeRequestError("Selecione um apontamento para ajustar.");
    if (
      s &&
      (s.state !== "finished" ||
        Number(s.correction_version) !== Number(b.version))
    )
      throw new TimeRequestError(
        "Finalize o apontamento e atualize a lista antes de ajustar.",
      );
    if (
      !direct &&
      (legacy
        ? legacy.actor !== email
        : s
          ? s.actor !== email
          : !operation.sent_at ||
            !(
              operation.document.responsible === email ||
              operation.document.support?.includes(email)
            ))
    )
      throw new Forbidden();
    const actor = s?.actor || legacy?.actor || email;
    const kind =
      s?.kind ||
      (legacy ? (legacy.action === "work_log" ? "work" : "travel") : b.kind);
    if (!["work", "travel"].includes(kind))
      throw new TimeRequestError("Tipo inválido.");
    const proposed = validateTimeAdjustment(b.proposed);
    if (kind === "travel" && proposed.pauses.length)
      throw new TimeRequestError(
        "Deslocamentos não possuem pausas de atividade.",
      );
    const justification = reason(b.reason);
    // Planner corrections don't fabricate GPS: their audit location is explicitly unavailable.
    const location = direct
      ? { source: "planner", unavailable: true }
      : locationOf(b.location);
    const employee = (
      await c.query(
        "SELECT managers,display_name FROM web_user_access WHERE email=$1",
        [actor],
      )
    ).rows[0];
    const managers = (
      await c.query(
        "SELECT email FROM web_user_access WHERE enabled AND email<>$2 AND email=ANY($1::text[])",
        [employee.managers || [], actor],
      )
    ).rows.map((u: any) => u.email);
    if (!direct && !managers.length)
      throw new TimeRequestError(
        "Cadastre ao menos um gestor ativo para aprovar os apontamentos.",
      );
    if (
      legacy &&
      (
        await c.query(
          "SELECT id FROM web_field_time_requests WHERE legacy_event_id=$1 AND status='pending'",
          [legacy.id],
        )
      ).rows.length
    )
      throw new TimeRequestError(
        "Este apontamento já possui solicitação aguardando aprovação.",
      );
    if (s) {
      const pending = (
        await c.query(
          "SELECT id FROM web_field_time_requests WHERE session_id=$1 AND status='pending'",
          [s.id],
        )
      ).rows;
      if (pending.length)
        throw new TimeRequestError(
          "Este apontamento já possui uma solicitação aguardando aprovação.",
        );
    }
    // Guard against concurrent/overlapping sessions, including previously approved corrections.
    const overlaps = await c.query(
      `SELECT id FROM web_field_sessions WHERE actor=$1 AND ($2::uuid IS NULL OR id<>$2) AND COALESCE((correction->>'started_at')::timestamptz,started_at)<$4::timestamptz AND COALESCE((correction->>'finished_at')::timestamptz,finished_at,'infinity'::timestamptz)>$3::timestamptz`,
      [actor, s?.id || null, proposed.started_at, proposed.finished_at],
    );
    if (overlaps.rows.length)
      throw new TimeRequestError(
        "O horário coincide com outro apontamento da pessoa.",
      );
    const id = randomUUID();
    const r = {
      id,
      legacy_event_id: legacy?.id || null,
      original: legacy,
      session_id: s?.id || null,
      operation_id: operation.id,
      actor,
      kind,
      reason: justification,
      proposed,
      base_version: Number(s?.correction_version || 0),
      location,
    };
    await c.query(
      "INSERT INTO web_field_time_requests(id,request_key,operation_id,session_id,requester,actor,kind,reason,proposed,original,base_version,managers,location) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [
        id,
        key,
        operation.id,
        r.session_id,
        email,
        actor,
        kind,
        justification,
        JSON.stringify(proposed),
        s ? JSON.stringify(s) : null,
        r.base_version,
        JSON.stringify(managers),
        JSON.stringify(location),
      ],
    );
    if (legacy)
      await c.query(
        "UPDATE web_field_time_requests SET legacy_event_id=$2,original=$3 WHERE id=$1",
        [id, legacy.id, JSON.stringify(legacy)],
      );
    if (direct) await apply(c, r, email);
    else {
      const os = (
        await c.query(
          "SELECT s.company_id,s.order_id,o.numero_sequencia,o.equipamento,o.cliente_nome FROM web_service_schedules s LEFT JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id WHERE s.id=$1",
          [operation.schedule_id],
        )
      ).rows[0];
      const fmt = (v: string) =>
        new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      for (const manager of managers) {
        const task = (
          await c.query(
            `INSERT INTO web_tasks(source_key,cycle,origin,title,equipment_name,customer,source_status,priority,assigned_to,first_assigned_at,created_by,updated_by,order_company,order_id,order_number) VALUES($1,$2,'Aprovação de apontamento',$3,$4,$5,'Aguardando aprovação','normal',$6,now(),$7,$7,$8,$9,$10) RETURNING id`,
            [
              "time-request:" + id + ":" + manager,
              id,
              "Aprovar apontamento · " + (employee.display_name || actor),
              os.equipamento || "",
              os.cliente_nome || "",
              manager,
              email,
              os.company_id,
              os.order_id,
              String(os.numero_sequencia || os.order_id),
            ],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO web_task_notifications(task_id,task_version,recipient) VALUES($1,1,$2)",
          [task.id, manager],
        );
        const description = `Funcionário: ${employee.display_name || actor}\nOS ${os.numero_sequencia || os.order_id} · Operação ${operationNumber(operation.position)} · ${operation.document.description}\nTipo: ${s || legacy ? "Ajuste" : "Inclusão manual"} de ${kind === "work" ? "atividade" : "deslocamento"}\nMotivo: ${justification}\nHorário solicitado: ${fmt(proposed.started_at)} até ${fmt(proposed.finished_at)}\nAtividade/deslocamento: ${(proposed.active_seconds / 3600).toFixed(2)} h · Paradas: ${(proposed.pause_seconds / 3600).toFixed(2)} h\nPausas: ${proposed.pauses.map((p: any) => p.reason + " (" + fmt(p.start) + " – " + fmt(p.end) + ")").join("; ") || "Nenhuma"}\n${s ? "Original: " + fmt(s.correction?.started_at || s.started_at) + " até " + fmt(s.correction?.finished_at || s.finished_at) : legacy ? "Horas originais: " + legacy.hours + " h" : "Localização capturada na solicitação, não no horário manual."}`;
        await c.query(
          "INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) VALUES($1,$2,$3,false,$4,$5)",
          [
            task.id,
            "Solicitação aguardando aprovação",
            description,
            email,
            user.display_name || email,
          ],
        );
      }
    }
    await c.query("COMMIT");
    return { ok: true, id };
  } catch (e) {
    await c.query("ROLLBACK");
    if (e instanceof Forbidden || e instanceof TimeRequestError) throw e;
    if (e instanceof Error && !(e as any).code)
      throw new TimeRequestError(e.message);
    throw e;
  } finally {
    c.release();
  }
}
