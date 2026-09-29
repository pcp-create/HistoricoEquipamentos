import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { Forbidden } from "../auth";
import { combineOrderItems } from "./linked-items";
import { locationOf, odometer, sessionTotals } from "./field-model";
import { updateChecklist, prepareChecklistSubmission } from "./checklist-store";
import { reportSubmission, stagesOf } from "./checklists";
export class FieldError extends Error {}
const assigned =
  "(p.document->>'responsible'=$1 OR p.document->'support' ? $1)";
const key = (i: any) =>
  `${i.item_company}:${i.item_order}:${i.id_m8 ?? i.item_id}`;
async function user(c: any, email: string) {
  const profile=(await c.query("SELECT display_name FROM web_user_access WHERE email=$1 AND enabled",[email])).rows[0];
  if(!profile)throw new Forbidden();
  return profile;
}
async function materials(c: any, s: any) {
  const link = (
    await c.query(
      "SELECT linked_company_id,linked_order_id FROM web_order_links WHERE company_id=$1 AND order_id=$2 AND linked_company_id IS NOT NULL AND linked_order_id IS NOT NULL",
      [s.company_id, s.order_id],
    )
  ).rows[0];
  const origins = [
    { company: s.company_id, order: s.order_id },
    ...(link
      ? [{ company: link.linked_company_id, order: link.linked_order_id }]
      : []),
  ];
  const raw = await Promise.all(
    origins.map(async (v) => ({
      order: {},
      materials: (
        await c.query(
          "SELECT id_m8::text,produto_id::text,produto_nome,quantidade,unidade_nome,esta_excluido,aprovado FROM m8_os_produtos WHERE company_id=$1 AND ordem_servico_id=$2",
          [v.company, v.order],
        )
      ).rows,
    })),
  );
  const items = combineOrderItems(
    raw[0],
    raw[1],
    "materials",
    s.company_id,
    s.order_id,
    link?.linked_company_id,
    link?.linked_order_id,
  );
  const usage = (
    await c.query(
      `SELECT i.*,u.display_name,o.position FROM web_service_item_usage i LEFT JOIN web_user_access u ON u.email=i.updated_by LEFT JOIN web_service_operations o ON o.id=i.operation_id WHERE i.schedule_id=$1`,
      [s.id],
    )
  ).rows;
  // finalized means a stable Processado OS, not a completed materials import.
  // last_detail_at is written atomically with the complete persisted collections.
  const complete = (
    await Promise.all(
      origins.map(
        async (v) =>
          (
            await c.query(
              "SELECT last_detail_at IS NOT NULL AS collected FROM integracao_m8_os_sync WHERE company_id=$1 AND ordem_servico_id=$2",
              [v.company, v.order],
            )
          ).rows[0]?.collected === true,
      ),
    )
  ).every(Boolean);
  return {
    complete,
    items: items.map((i: any) => ({
      ...i,
      usage: usage.find((v: any) => key(v) === key(i)) || null,
    })),
  };
}
async function hasReadInformation(c:any,operationId:string,email:string){
 return (await c.query("SELECT 1 FROM web_field_events WHERE operation_id=$1 AND actor=$2 AND action='info_read' LIMIT 1",[operationId,email])).rows.length>0;
}
export async function fieldData(email: string, operationId?: string | null) {
  const c = database();
  const profile = await user(c, email);
  const settings = (
    await c.query(
      "SELECT document FROM web_service_schedule_settings WHERE id=1",
    )
  ).rows[0].document;
  const active =
    (
      await c.query(
        "SELECT * FROM web_field_sessions WHERE actor=$1 AND state<>'finished'",
        [email],
      )
    ).rows[0] || null;
  if (!operationId) {
    const rows = (
      await c.query(
        `SELECT p.id,p.schedule_id,p.position,p.status,p.document->>'description' description,p.document->>'date' date,p.document->>'time' time,
   o.id_m8::text AS order_id,COALESCE(o.numero_sequencia,o.id_m8)::text AS number,o.cliente_nome customer,o.equipamento equipment,c.payload->>'municipioNome' city,c.payload->>'ufSigla' state,
   EXISTS(SELECT 1 FROM web_field_material_checks k WHERE k.operation_id=p.id AND k.actor=$1) checked
   FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
   LEFT JOIN m8_customer_directory c ON c.company_id=o.company_id AND c.person_id=o.cliente_id
   WHERE s.active AND p.sent_at IS NOT NULL AND ${assigned} AND p.status<>'completed'
   ORDER BY p.document->>'date' DESC NULLS LAST,p.document->>'time' DESC NULLS LAST,p.position`,
        [email],
      )
    ).rows;
    return { rows, active, email, displayName: profile.display_name };
  }
  if (!/^[0-9a-f-]{36}$/i.test(operationId))
    throw new FieldError("Operação inválida.");
  const p = (
    await c.query(
      `SELECT p.*,s.company_id,s.order_id FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id WHERE p.id=$2 AND s.active AND p.sent_at IS NOT NULL AND ${assigned}`,
      [email, operationId],
    )
  ).rows[0];
  if (!p) throw new Forbidden();
  const order = (
    await c.query(
      "SELECT equipamento,observacao FROM m8_ordens_servico WHERE company_id=$1 AND id_m8=$2",
      [p.company_id, p.order_id],
    )
  ).rows[0];
  const equipment_links = (
    await c.query(
      `SELECT e.equipment_id::text,e.name,e.serial FROM m8_order_equipment_links l JOIN m8_equipment_catalog e USING(equipment_id) WHERE l.company_id=$1 AND l.order_id=$2 AND NOT l.stale AND e.present`,
      [p.company_id, p.order_id],
    )
  ).rows;
  const checked =
    (
      await c.query(
        "SELECT 1 FROM web_field_material_checks WHERE operation_id=$1 AND actor=$2",
        [p.id, email],
      )
    ).rows.length > 0;
  const history = (
    await c.query(
      `SELECT e.action,e.created_at,u.display_name,e.document FROM web_field_events e LEFT JOIN web_user_access u ON u.email=e.actor WHERE e.operation_id=$1 ORDER BY e.created_at DESC LIMIT 50`,
      [p.id],
    )
  ).rows;
  const submission=reportSubmission(p.document.checklistRun);
  if(submission&&!submission.name){
    submission.name=(await c.query('SELECT display_name FROM web_user_access WHERE email=$1',[submission.by])).rows[0]?.display_name||submission.by;
  }
  return {
    reportSubmission:submission,
    operation: p,
    active,
    email,
    checked,
    infoRead: await hasReadInformation(c,p.id,email),
    progress: (await c.query(`SELECT
      EXISTS(SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND actor=$2 AND kind='travel' AND state='finished') AS travel,
      EXISTS(SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND actor=$2 AND kind='work' AND state='finished') AS work,
      EXISTS(SELECT 1 FROM web_field_events WHERE operation_id=$1 AND action='finish_partial') AS partial
    `,[p.id,email])).rows[0],
    materials: await materials(c, { ...p, id: p.schedule_id }),
    history,
    canEditSettings: false,
    settings: {
      document: {
        checklists: settings.checklists,
        pauseReasons: settings.pauseReasons || [],
        vehicles: settings.vehicles || [],
      },
    },
    detail: { order, equipment_links },
  };
}
export async function fieldAction(b: any, email: string) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await user(c, email);
    await c.query("SELECT pg_advisory_xact_lock(728001)");
    if (
      !b ||
      !/^[0-9a-f-]{36}$/i.test(b.operationId) ||
      !/^[0-9a-f-]{36}$/i.test(b.requestId)
    )
      throw new FieldError("Registro inválido. Atualize a tela.");
    const p = (
      await c.query(
        `SELECT p.*,s.company_id,s.order_id FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id WHERE p.id=$2 AND s.active AND p.sent_at IS NOT NULL AND ${assigned} FOR UPDATE OF p`,
        [email, b.operationId],
      )
    ).rows[0];
    if (!p) throw new Forbidden();
    const duplicate = (
      await c.query(
        "SELECT actor,operation_id FROM web_field_events WHERE request_id=$1",
        [b.requestId],
      )
    ).rows[0];
    if (duplicate) {
      if (duplicate.actor !== email || duplicate.operation_id !== p.id)
        throw new FieldError("Identificador de registro já utilizado.");
      await c.query("COMMIT");
      return { saved: true };
    }
    if (["awaiting_review", "reviewed", "completed"].includes(p.status))
      throw new FieldError(
        "Esta operação já foi enviada para revisão e não permite novos apontamentos.",
      );
    const location = locationOf(b.location);
    const s = {
      id: p.schedule_id,
      company_id: p.company_id,
      order_id: p.order_id,
    };
    const settings = (
      await c.query(
        "SELECT document FROM web_service_schedule_settings WHERE id=1",
      )
    ).rows[0].document;
    const checked =
      (
        await c.query(
          "SELECT 1 FROM web_field_material_checks WHERE operation_id=$1 AND actor=$2",
          [p.id, email],
        )
      ).rows.length > 0;
    if (b.action !== "info_read" && !(await hasReadInformation(c,p.id,email)))
      throw new FieldError("Leia e confirme as observações internas antes de continuar.");
    if (!["materials","info_read"].includes(b.action) && !checked)
      throw new FieldError("Confira as peças antes de iniciar o trabalho.");
    const active = (
      await c.query(
        "SELECT * FROM web_field_sessions WHERE actor=$1 AND state<>'finished' FOR UPDATE",
        [email],
      )
    ).rows[0];
    let details: any = {};
    let operationUpdated = false;
    if (b.action === "info_read") {
      details={internalNote:p.document.internalNote||""};
      operationUpdated=true;
    } else if (b.action === "materials") {
      const current = await materials(c, s);
      if (!current.complete)
        throw new FieldError(
          "Aguarde a importação completa dos materiais da OS antes da conferência.",
        );
      if (
        !Array.isArray(b.items) ||
        b.items.length !== current.items.length ||
        new Set(b.items.map(key)).size !== b.items.length
      )
        throw new FieldError("A lista de peças mudou. Reabra a conferência.");
      details.changes = [];
      for (const item of current.items) {
        const patch = b.items.find((v: any) => key(v) === key(item));
        if (!patch) throw new FieldError("Confira todos os materiais da OS.");
        const withdrawn = patch.withdrawn;
        if (
          withdrawn !== null &&
          (typeof withdrawn !== "number" ||
            !Number.isFinite(withdrawn) ||
            withdrawn < 0 ||
            withdrawn > 1e9)
        )
          throw new FieldError("Quantidade retirada inválida.");
        if ((item.usage?.version ?? null) !== patch.version)
          throw new FieldError(
            "Outro técnico atualizou as peças. Reabra a conferência para ver os valores atuais.",
          );
        if (
          (item.usage?.withdrawn == null
            ? null
            : Number(item.usage.withdrawn)) === withdrawn
        )
          continue;
        if (withdrawn === null)
          throw new FieldError(
            "Informe zero para corrigir uma retirada, em vez de apagar a quantidade.",
          );
        await c.query(
          `INSERT INTO web_service_item_usage(schedule_id,item_company,item_order,item_id,withdrawn,updated_by,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(schedule_id,item_company,item_order,item_id) DO UPDATE SET withdrawn=$5,updated_by=$6,operation_id=$7,updated_at=now(),version=web_service_item_usage.version+1`,
          [
            s.id,
            item.item_company,
            item.item_order,
            item.id_m8,
            withdrawn,
            email,
            p.id,
          ],
        );
        details.changes.push({
          item: key(item),
          before: item.usage?.withdrawn ?? null,
          after: withdrawn,
        });
      }
      await c.query(
        "INSERT INTO web_field_material_checks(operation_id,actor) VALUES($1,$2) ON CONFLICT(operation_id,actor) DO UPDATE SET confirmed_at=now()",
        [p.id, email],
      );
      details.noWithdrawal = b.items.every((v: any) => !v.withdrawn);
    } else if (b.action === "start_work" || b.action === "start_travel") {
      if (active)
        throw new FieldError(
          "Finalize o apontamento em andamento antes de iniciar outro.",
        );
      if (b.action === "start_travel" && !p.document.vehicleId)
        throw new FieldError(
          "Peça ao planejamento para atribuir o veículo à operação.",
        );
      const start = b.action === "start_travel" ? odometer(b.odometer) : null;
      const sessionId = randomUUID();
      await c.query(
        `INSERT INTO web_field_sessions(id,operation_id,actor,kind,state,vehicle_id,odometer_start) VALUES($1,$2,$3,$4,'running',$5,$6)`,
        [
          sessionId,
          p.id,
          email,
          b.action === "start_work" ? "work" : "travel",
          p.document.vehicleId || null,
          start,
        ],
      );
      details = {
        sessionId,
        odometer: start,
        vehicleId: p.document.vehicleId || null,
      };
    } else if (["pause", "resume", "stop", "pause_ack"].includes(b.action)) {
      if (!active || active.operation_id !== p.id || active.id !== b.sessionId)
        throw new FieldError("O apontamento mudou. Atualize a tela.");
      const totals = sessionTotals(active);
      if (b.action === "pause_ack") {
        if (active.state !== "paused")
          throw new FieldError("Não há pausa ativa.");
        await c.query(
          "UPDATE web_field_sessions SET pause_alert_at=now() WHERE id=$1",
          [active.id],
        );
      } else if (b.action === "pause") {
        if (active.kind !== "work" || active.state !== "running")
          throw new FieldError(
            "Somente atividade em andamento pode ser pausada.",
          );
        const reason = settings.pauseReasons?.find(
          (r: any) => r.id === b.reasonId,
        );
        if (!reason) throw new FieldError("Selecione a causa da pausa.");
        await c.query(
          "UPDATE web_field_sessions SET state='paused',active_seconds=$2,segment_at=now(),pause_reason=$3,pause_alert_at=now() WHERE id=$1",
          [active.id, totals.active, JSON.stringify(reason)],
        );
        details.reason = reason;
      } else if (b.action === "resume") {
        if (active.state !== "paused")
          throw new FieldError("A atividade não está pausada.");
        await c.query(
          "UPDATE web_field_sessions SET state='running',pause_seconds=$2,segment_at=now(),pause_reason=NULL,pause_alert_at=NULL WHERE id=$1",
          [active.id, totals.pause],
        );
      } else {
        const end = active.kind === "travel" ? odometer(b.odometer) : null;
        if (end !== null && end < Number(active.odometer_start))
          throw new FieldError(
            "O odômetro final não pode ser menor que o inicial.",
          );
        await c.query(
          "UPDATE web_field_sessions SET state='finished',finished_at=now(),active_seconds=$2,pause_seconds=$3,segment_at=now(),odometer_end=$4 WHERE id=$1",
          [active.id, totals.active, totals.pause, end],
        );
        await c.query(
          "INSERT INTO web_service_operation_events(operation_id,action,hours,actor,description) VALUES($1,$2,$3,$4,$5)",
          [
            p.id,
            active.kind === "work" ? "work_log" : "travel_log",
            totals.active / 3600,
            email,
            active.kind === "work"
              ? "Apontamento pelo técnico (pausas descontadas)"
              : "Deslocamento do técnico",
          ],
        );
        details.odometer = end;
      }
      details = { ...details, sessionId: active.id, seconds: totals };
    } else if (b.action === "report_save") {
      if(reportSubmission(p.document.checklistRun))throw new FieldError("Relatório enviado. O planejador precisa reabrir a edição.");
      if(p.version!==b.version)throw new FieldError('O relatório foi atualizado. Reabra para carregar a versão atual.');
      if(!Array.isArray(b.stages)||b.stages.length>100||new Set(b.stages.map((s:any)=>s.stageId)).size!==b.stages.length)throw new FieldError('Etapas inválidas.');
      let current=p;
      for(const stage of b.stages){
        current=await updateChecklist(c,{...stage,action:'checklist_save'},current,s,settings,email,false);
      }
      operationUpdated=true;
      details={stages:b.stages.map((s:any)=>s.stageId)};
    } else if (b.action === "report_send") {
      if(reportSubmission(p.document.checklistRun))throw new FieldError("Relatório enviado. O planejador precisa reabrir a edição.");
      if(p.document.responsible!==email)throw new FieldError('Somente o responsável pode enviar o relatório.');
      if(p.version!==b.version)throw new FieldError('O checklist foi atualizado. Reabra para carregar a versão atual.');
      if(!p.document.checklistId)throw new FieldError('Esta operação não possui checklist.');
      const checklistRun=prepareChecklistSubmission(p.document.checklistRun,email);
      checklistRun.submission={at:new Date().toISOString(),by:email,name:(await user(c,email)).display_name||email};
      await c.query("UPDATE web_service_operations SET document=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1",[p.id,JSON.stringify({...p.document,checklistRun}),email]);
      await c.query('INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,$2,$3,$4)',[p.id,b.action,email,'Relatório enviado pelo técnico']);
      operationUpdated=true;
    } else if (b.action === "finish_partial" || b.action === "finish_full") {
      if (p.document.responsible !== email)
        throw new FieldError("Somente o responsável pode enviar a operação.");
      if (
        (
          await c.query(
            "SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND state<>'finished'",
            [p.id],
          )
        ).rows.length
      )
        throw new FieldError(
          "Finalize os apontamentos da equipe antes de enviar o relatório.",
        );
      if (b.action === "finish_full" && p.document.checklistId) {
        p.document={...p.document,checklistRun:prepareChecklistSubmission(p.document.checklistRun,email)};
        await c.query('UPDATE web_service_operations SET document=$2 WHERE id=$1',[p.id,JSON.stringify(p.document)]);
      }
      await c.query(
        "UPDATE web_service_operations SET status=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1",
        [
          p.id,
          b.action === "finish_full" ? "awaiting_review" : "executing",
          email,
        ],
      );
      operationUpdated = true;
      await c.query(
        "INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,$2,$3,$4)",
        [
          p.id,
          b.action,
          email,
          b.action === "finish_full"
            ? "Relatório completo enviado pelo técnico"
            : "Relatório parcial enviado pelo técnico",
        ],
      );
    } else if (["checklist_save", "checklist_submit"].includes(b.action)) {
      if (p.version !== b.version)
        throw new FieldError(
          "O checklist foi atualizado. Reabra para carregar a versão atual.",
        );
      await updateChecklist(c, b, p, s, settings, email, false);
      operationUpdated = true;
      details = { stageId: b.stageId };
    } else throw new FieldError("Ação inválida.");
    if (!operationUpdated)
      await c.query(
        "UPDATE web_service_operations SET status='executing',version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1",
        [p.id, email],
      );
    await c.query(
      `INSERT INTO web_field_events(request_id,operation_id,actor,action,latitude,longitude,accuracy,located_at,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        b.requestId,
        p.id,
        email,
        b.action,
        location.latitude,
        location.longitude,
        location.accuracy,
        location.at,
        JSON.stringify(details),
      ],
    );
    await c.query("COMMIT");
    return { saved: true };
  } catch (e) {
    await c.query("ROLLBACK");
    if (e instanceof Forbidden || e instanceof FieldError) throw e;
    if (e instanceof Error && !(e as any).code) throw new FieldError(e.message);
    throw e;
  } finally {
    c.release();
  }
}
