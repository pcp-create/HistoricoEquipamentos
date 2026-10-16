/* Shared by the service worker and regression tests. No server state is mutated here. */
function projectField(home, detail, body) {
  const at = body.offline.capturedAt,
    op = detail.operation,
    action = body.action;
  let active = home.active,
    closed = null;
  const same = active?.operation_id === op.id;
  if (action === "info_read") detail.infoRead = true;
  if (action === "materials") {
    detail.checked = true;
    for (const item of detail.materials?.items || []) {
      const patch = body.items?.find(
        (p) =>
          p.item_company === item.item_company &&
          p.item_order === item.item_order &&
          String(p.id_m8 ?? p.item_id) === String(item.id_m8 ?? item.item_id),
      );
      if (patch) {
        const usage = item.usage;
        const allocations = Array.isArray(usage?.allocations)
          ? usage.allocations
          : [
              ...(Number(usage?.withdrawn) > 0
                ? [
                    {
                      operationId: usage.operation_id || null,
                      quantity: Number(usage.withdrawn),
                      position: usage.position,
                      by: usage.updated_by,
                      name: usage.display_name,
                      at: usage.updated_at,
                    },
                  ]
                : []),
            ];
        const own = Number(
          allocations.find((a) => a.operationId === op.id)?.quantity || 0,
        );
        if (patch.withdrawn === null || Number(patch.withdrawn) === own)
          continue;
        const remaining = allocations.filter((a) => a.operationId !== op.id);
        if (patch.withdrawn > 0)
          remaining.push({
            operationId: op.id,
            position: op.position,
            quantity: patch.withdrawn,
            by: home.email,
            name: home.displayName,
            at,
          });
        item.usage = {
          ...usage,
          withdrawn:
            Math.round(
              (Number(usage?.withdrawn || 0) - own + patch.withdrawn) * 1000,
            ) / 1000,
          allocations: remaining,
          operation_id: op.id,
          version: Number(usage?.version || 0) + 1,
        };
      }
    }
  }
  if (action === "start_work" || action === "start_travel") {
    if (active)
      throw Error(
        "Finalize o apontamento em andamento antes de iniciar outro.",
      );
    active = {
      id: body.requestId,
      operation_id: op.id,
      actor: home.email,
      kind: action === "start_work" ? "work" : "travel",
      state: "running",
      started_at: at,
      segment_at: at,
      active_seconds: 0,
      pause_seconds: 0,
      pause_history_seconds: Number(detail.pause_history_seconds||0),
      odometer_start: body.odometer,
    };
  }
  if (["pause", "resume", "stop", "pause_ack"].includes(action)) {
    if (!same || active.id !== body.sessionId)
      throw Error("O apontamento mudou. Atualize a tela.");
    const seconds = Math.max(
      0,
      (Date.parse(at) - Date.parse(active.segment_at)) / 1000,
    );
    if (action === "pause_ack") active.pause_alert_at = at;
    else {
      if (active.state === "running")
        active.active_seconds = Number(active.active_seconds) + seconds;
      else active.pause_seconds = Number(active.pause_seconds) + seconds;
      active.segment_at = at;
      if (action === "pause") {
        active.state = "paused";
        active.pause_reason = detail.settings.document.pauseReasons.find(
          (r) => r.id === body.reasonId,
        );
        active.pause_alert_at = at;
      }
      if (action === "resume") {
        active.state = "running";
        active.pause_reason = null;
        active.pause_alert_at = null;
      }
      if (action === "stop") {
        detail.progress = { ...detail.progress, [active.kind]: true };
        detail.pause_history_seconds=Number(detail.pause_history_seconds||0)+Number(active.pause_seconds||0);
        closed = {
          ...active,
          state: "finished",
          finished_at: at,
          odometer_end: body.odometer,
        };
        active = null;
      }
    }
  }
  if (
    [
      "report_save",
      "report_return",
      "report_send",
      "report_send_partial",
      "checklist_save",
      "checklist_submit",
    ].includes(action)
  ) {
    if (action!=="report_return"&&(!same || active.kind !== "work" || active.state !== "running"))
      throw Error("Inicie ou retome a atividade para preencher o relatório.");
    const run = op.document.checklistRun;
    if (!run) throw Error("Baixe o checklist antes de ficar sem internet.");
    for (const stage of body.stages || [body]) {
      if (!stage.stageId) continue;
      run.stages[stage.stageId] = {
        ...run.stages[stage.stageId],
        answers: stage.answers,
        details: stage.details,
      };
      run.equipmentId = stage.equipmentId;
      run.meterDate = stage.meterDate;
    }
    if (action === "report_send") {
      run.submission = { at, by: home.email, name: home.displayName };
      detail.reportSubmission = run.submission;
    }
  }
  if (action === "report_return") op.status = "planning";
  else if (action === "finish_full") op.status = "awaiting_review";
  else if (action !== "info_read") op.status = "executing";
  // The server resolves exact versions through the preceding request receipt.
  if (action !== "info_read") op.version = Number(op.version) + 1;
  home.active = active;
  detail.active = active;
  for (const row of [...(home.rows || []), ...(home.calendarRows || [])]) {
    if (row.id === op.id) {
      row.version = op.version;
      row.status = op.status;
      row.checked = detail.checked;
    }
  }
  if (action === "finish_full" || action === "report_return")
    home.rows = home.rows.filter((r) => r.id !== op.id);
  detail.finishPending = [];
  if (!detail.infoRead)
    detail.finishPending.push(
      "Informações: leia e confirme as observações internas.",
    );
  if (!detail.checked || !detail.materials?.complete)
    detail.finishPending.push("Peças: conclua a conferência dos materiais.");
  if (!detail.progress?.work)
    detail.finishPending.push(
      "Atividade: registre e conclua um apontamento de atividade.",
    );
  if (active)
    detail.finishPending.push(
      "Apontamentos: finalize os apontamentos em andamento.",
    );
  if (op.document.checklistId && !detail.reportSubmission)
    detail.finishPending.push("Relatório: conclua e envie o relatório.");
  detail.history = [
    {
      action,
      created_at: at,
      display_name: home.displayName,
      document: { offline: true },
    },
    ...(detail.history || []),
  ];
  return { home, detail, session: closed || active };
}
if (typeof module !== "undefined") module.exports = { projectField };
