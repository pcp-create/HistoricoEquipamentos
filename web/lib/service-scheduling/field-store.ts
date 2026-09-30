import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { Forbidden } from "../auth";
import { combineOrderItems } from "./linked-items";
import { locationOf, odometer, sessionTotals } from "./field-model";
import { updateChecklist, prepareChecklistSubmission } from "./checklist-store";
import { materialBalance, materialQuantity } from "./material-balance";
import { calendarEnd, planningStatus } from "./model";
import { reportSubmission, stagesOf } from "./checklists";
function estimatedEnd(document: any, settings: any) {
  try {
    return calendarEnd(document, settings.calendars?.find((calendar: any) =>
      calendar.id === (document.calendarId || document.calendar_id || "standard")));
  } catch { return null; }
}
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
      `SELECT i.*,u.display_name,o.position,
        COALESCE(withdrawal.actor,i.updated_by) AS withdrawn_by,
        COALESCE(withdrawer.display_name,u.display_name) AS withdrawn_name,
        COALESCE(withdrawal.created_at,i.updated_at) AS withdrawn_at
       FROM web_service_item_usage i
       LEFT JOIN web_user_access u ON u.email=i.updated_by
       LEFT JOIN web_service_operations o ON o.id=i.operation_id
       LEFT JOIN LATERAL (
         SELECT e.actor,e.created_at FROM web_field_events e
         WHERE e.operation_id=i.operation_id AND e.action='materials'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.document->'changes') change
           WHERE change->>'item'=concat(i.item_company,':',i.item_order,':',i.item_id)
           AND (change->>'after')::numeric > 0)
         ORDER BY e.created_at DESC LIMIT 1
       ) withdrawal ON true
       LEFT JOIN web_user_access withdrawer ON withdrawer.email=withdrawal.actor
       WHERE i.schedule_id=$1`,
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
        `SELECT p.id,p.schedule_id,p.position,p.status,p.version,p.document->>'description' description,p.document->>'date' date,p.document->>'time' time,p.document->'duration' duration,p.document->>'calendarId' calendar_id,
   o.id_m8::text AS order_id,COALESCE(o.numero_sequencia,o.id_m8)::text AS number,o.cliente_nome customer,o.equipamento equipment,c.payload->>'municipioNome' city,c.payload->>'ufSigla' state,
   EXISTS(SELECT 1 FROM web_field_material_checks k WHERE k.operation_id=p.id AND k.actor=$1) checked
   FROM web_service_operations p JOIN web_service_schedules s ON s.id=p.schedule_id JOIN m8_ordens_servico o ON o.company_id=s.company_id AND o.id_m8=s.order_id
   LEFT JOIN m8_customer_directory c ON c.company_id=o.company_id AND c.person_id=o.cliente_id
   WHERE s.active AND p.sent_at IS NOT NULL AND ${assigned} AND p.status NOT IN ('awaiting_review','reviewed','completed')
   ORDER BY p.document->>'date' DESC NULLS LAST,p.document->>'time' DESC NULLS LAST,p.position`,
        [email],
      )
    ).rows;
    return { rows: rows.map((row: any) => ({
      ...row, estimated_end: estimatedEnd(row, settings),
    })), active, email, displayName: profile.display_name };
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
  const materialData = await materials(c, { ...p, id: p.schedule_id });
  return {
    finishPending: await finishPending(c, p, email, materialData.complete),
    reportSubmission:submission,
    estimated_end: estimatedEnd(p.document, settings),
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
    materials: materialData,
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
async function finishPending(c: any, p: any, email: string, materialsComplete: boolean) {
  const progress = (await c.query(`SELECT
    EXISTS(SELECT 1 FROM web_field_events WHERE operation_id=$1 AND actor=$2 AND action='info_read') AS info,
    EXISTS(SELECT 1 FROM web_field_material_checks WHERE operation_id=$1 AND actor=$2) AS checked,
    EXISTS(SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND kind='work' AND state='finished') AS worked,
    EXISTS(SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND state<>'finished') AS active
  `, [p.id, email])).rows[0];
  const pending: string[] = [];
  if (!progress.info) pending.push("Informações: leia e confirme as observações internas.");
  if (!materialsComplete || !progress.checked) pending.push("Peças: conclua a conferência dos materiais.");
  if (!progress.worked) pending.push("Atividade: registre e conclua um apontamento de atividade.");
  if (progress.active) pending.push("Apontamentos: finalize os apontamentos de atividade, deslocamento e pausas de toda a equipe.");
  if (p.document.checklistId) {
    if (!reportSubmission(p.document.checklistRun)) pending.push("Relatório: conclua as etapas obrigatórias e faça o envio completo.");
    else {
      try { prepareChecklistSubmission(p.document.checklistRun, email); }
      catch { pending.push("Relatório: há etapas obrigatórias pendentes. Solicite a reabertura ao planejamento para corrigir."); }
    }
  }
  return pending;
}
export async function fieldAction(b: any, email: string) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const actor = await user(c, email);
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
    if (b.action === "finish_partial")
      throw new FieldError("A finalização parcial não está mais disponível. Conclua os módulos para encerrar a operação.");
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
    if (!["info_read","report_return"].includes(b.action) && !(await hasReadInformation(c,p.id,email)))
      throw new FieldError("Leia e confirme as observações internas antes de continuar.");
    if (!["materials","info_read","report_return"].includes(b.action) && !checked)
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
      if (b.quantityScope !== "operation")
        throw new FieldError("O controle de retiradas mudou. Atualize a página e reabra a conferência.");
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
        const balance = materialBalance(item, p.id);
        if (withdrawn === null && !balance.own) continue;
        if (withdrawn === null)
          throw new FieldError("Informe zero para devolver a retirada desta operação.");
        if (Math.abs(withdrawn - materialQuantity(withdrawn)) > 1e-9)
          throw new FieldError("Informe a quantidade com até três casas decimais.");
        if (balance.own === withdrawn) continue;
        const total = materialQuantity(balance.total - balance.own + withdrawn);
        if (withdrawn > balance.own && total > balance.reserved)
          throw new FieldError(`Saldo insuficiente. Disponível para retirada: ${balance.available}. Outra operação pode ter retirado este material.`);
        if (total < Number(item.usage?.used || 0))
          throw new FieldError("Não é possível devolver uma quantidade já utilizada. Confira a utilização com o planejamento.");
        const allocations = balance.withdrawals.filter(row => row.operationId !== p.id);
        const previous = balance.withdrawals.find(row => row.operationId === p.id);
        if (withdrawn > 0) allocations.push({ operationId: p.id, position: p.position,
          quantity: withdrawn,
          by: withdrawn < balance.own && previous ? previous.by : email,
          name: withdrawn < balance.own && previous ? previous.name : actor.display_name || email,
          at: withdrawn < balance.own && previous ? previous.at : new Date().toISOString() });
        await c.query(
          `INSERT INTO web_service_item_usage(schedule_id,item_company,item_order,item_id,withdrawn,updated_by,operation_id,allocations) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     ON CONFLICT(schedule_id,item_company,item_order,item_id) DO UPDATE SET withdrawn=$5,updated_by=$6,operation_id=$7,allocations=$8::jsonb,updated_at=now(),version=web_service_item_usage.version+1`,
          [
            s.id,
            item.item_company,
            item.item_order,
            item.id_m8,
            total,
            email,
            p.id,
            JSON.stringify(allocations),
          ],
        );
        details.changes.push({
          item: key(item),
          before: balance.total,
          after: total,
          operationBefore: balance.own,
          operationAfter: withdrawn,
          allocations,
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
    } else if (b.action === "report_return") {
      if(reportSubmission(p.document.checklistRun)||p.document.checklistRun?.partialSubmission)throw new FieldError("Após o envio do relatório, a devolução para ajuste do checklist não está disponível.");
      if(p.document.responsible!==email)throw new FieldError('Somente o responsável pode devolver para ajuste do checklist.');
      if(p.version!==b.version)throw new FieldError('A operação foi alterada. Atualize antes de devolver.');
      if(!p.document.checklistId)throw new FieldError('Esta operação não possui checklist.');
      if(b.confirmDiscard!==true)throw new FieldError('Confirme o descarte dos dados do relatório.');
      const reason=typeof b.reason==='string'?b.reason.trim():'';
      if(!reason||reason.length>2000)throw new FieldError('Informe o motivo da devolução (até 2.000 caracteres).');
      if((await c.query("SELECT 1 FROM web_field_sessions WHERE operation_id=$1 AND state<>'finished'",[p.id])).rows.length)throw new FieldError('Finalize os apontamentos ativos da operação antes de devolver.');
      const document={...p.document};
      delete document.checklistRun;
      document.checked=[];
      document.checklistReturn={at:new Date().toISOString(),by:email,reason,checklistId:p.document.checklistId};
      await c.query('DELETE FROM web_service_checklist_photos WHERE operation_id=$1',[p.id]);
      await c.query('UPDATE web_service_operations SET document=$2,status=$3,sent_at=NULL,version=version+1,updated_at=now(),updated_by=$4 WHERE id=$1',[p.id,JSON.stringify(document),planningStatus(document),email]);
      await c.query('INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,$2,$3,$4)',[p.id,b.action,email,'Devolvida para ajuste do checklist. Dados do relatório descartados. Motivo: '+reason]);
      operationUpdated=true;details={reason,checklistId:p.document.checklistId};
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
    } else if (b.action === "report_send" || b.action === "report_send_partial") {
      if(reportSubmission(p.document.checklistRun))throw new FieldError("Relatório enviado. O planejador precisa reabrir a edição.");
      if(p.document.responsible!==email)throw new FieldError('Somente o responsável pode enviar o relatório.');
      if(p.version!==b.version)throw new FieldError('O checklist foi atualizado. Reabra para carregar a versão atual.');
      if(!p.document.checklistId)throw new FieldError('Esta operação não possui checklist.');
      let current=p;
      if(b.stages!==undefined){
        if(!Array.isArray(b.stages)||b.stages.length>100||new Set(b.stages.map((s:any)=>s.stageId)).size!==b.stages.length)throw new FieldError('Etapas inválidas.');
        for(const stage of b.stages)current=await updateChecklist(c,{...stage,action:'checklist_save'},current,s,settings,email,false);
      }
      const partial=b.action==='report_send_partial';
      if(!current.document.checklistRun)throw new FieldError('Preencha e salve o relatório antes do envio.');
      const checklistRun=partial?structuredClone(current.document.checklistRun):prepareChecklistSubmission(current.document.checklistRun,email);
      const receipt={at:new Date().toISOString(),by:email,name:(await user(c,email)).display_name||email};
      if(partial)checklistRun.partialSubmission=receipt;
      else checklistRun.submission=receipt;
      await c.query("UPDATE web_service_operations SET document=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1",[p.id,JSON.stringify({...p.document,checklistRun}),email]);
      await c.query('INSERT INTO web_service_operation_events(operation_id,action,actor,description) VALUES($1,$2,$3,$4)',[p.id,b.action,email,partial?'Relatório enviado parcialmente; edição permanece liberada':'Relatório enviado completo pelo técnico']);
      operationUpdated=true;
    } else if (b.action === "finish_full") {
      if (p.document.responsible !== email)
        throw new FieldError("Somente o responsável pode enviar a operação.");
      const materialData = await materials(c, s);
      const pending = await finishPending(c, p, email, materialData.complete);
      if (pending.length) throw new FieldError("Não é possível encerrar a operação. " + pending.join(" "));
      await c.query(
        "UPDATE web_service_operations SET status=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1",
        [
          p.id,
          "awaiting_review",
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
          "Operação finalizada pelo técnico após conclusão dos módulos",
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
