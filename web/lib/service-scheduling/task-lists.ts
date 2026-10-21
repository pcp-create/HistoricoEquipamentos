import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  allTaskListFields,
  operationSnapshot,
  taskListOperation,
} from "./task-list-model";
import { validateOperation } from "./model";
export class TaskListInputError extends Error {}
export class TaskListConflict extends Error {}
const identifier = (value: any) => {
  if (typeof value !== "string" || !/^\d{1,18}$/.test(value))
    throw new TaskListInputError("Programação inválida.");
  return value;
};
const listId = (value: any) => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new TaskListInputError("Lista inválida.");
  return value;
};
async function audit(
  c: PoolClient,
  email: string,
  event: string,
  details: any,
) {
  await c.query(
    "INSERT INTO web_access_events(event,email,actor,details) VALUES($1,$2,$2,$3)",
    [event, email, JSON.stringify(details)],
  );
}
export async function readTaskLists(c: Pick<PoolClient, "query">) {
  return {
    lists: (
      await c.query(
        "SELECT * FROM web_service_task_lists WHERE active ORDER BY lower(name),id",
      )
    ).rows,
  };
}
async function sourceOperations(
  c: PoolClient,
  scheduleId: string,
  expected: any,
) {
  const schedule = (
    await c.query(
      "SELECT * FROM web_service_schedules WHERE id=$1 FOR UPDATE",
      [identifier(scheduleId)],
    )
  ).rows[0];
  if (!schedule?.active)
    throw new TaskListInputError("Programação não encontrada ou removida.");
  const rows = (
    await c.query(
      "SELECT * FROM web_service_operations WHERE schedule_id=$1 ORDER BY position,id FOR UPDATE",
      [scheduleId],
    )
  ).rows;
  if (
    !Array.isArray(expected) ||
    expected.some(
      (o: any) =>
        !o || typeof o.id !== "string" || !Number.isInteger(o.version),
    ) ||
    expected.length !== rows.length ||
    JSON.stringify(operationSnapshot(rows)) !==
      JSON.stringify(operationSnapshot(expected))
  )
    throw new TaskListConflict(
      "As operações foram alteradas. Atualize a OS antes de continuar.",
    );
  return rows;
}
async function documents(
  c: PoolClient,
  rows: any[],
  fields: string[],
  settings: any,
) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 200)
    throw new TaskListInputError("Inclua de 1 a 200 operações na lista.");
  const users = (
    await c.query("SELECT email,job_title,enabled FROM web_user_access")
  ).rows;
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const input = taskListOperation(rows[i], fields);
      if (input.internalNote.length > 20000)
        throw Error("Observação interna limitada a 20.000 caracteres.");
      const document = validateOperation(input, settings, users).document;
      if (document.equipmentId) {
        const equipment = (
          await c.query(
            "SELECT equipment_id::text,name,serial FROM m8_equipment_catalog WHERE equipment_id=$1 AND present FOR SHARE",
            [document.equipmentId],
          )
        ).rows[0];
        if (!equipment)
          throw Error("Selecione um equipamento ativo cadastrado.");
        document.equipment = equipment;
      }
      result.push(document);
    } catch (e) {
      throw new TaskListInputError(
        `Operação ${String(i + 1).padStart(2, "0")}: ${(e as Error).message}`,
      );
    }
  }
  return result;
}
export async function mutateTaskList(
  c: PoolClient,
  b: any,
  email: string,
  settings: any,
): Promise<any> {
  if (b.action === "task_list_save") {
    if (
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.trim().length > 120
    )
      throw new TaskListInputError("Informe um nome de até 120 caracteres.");
    if (
      !Array.isArray(b.fields) ||
      !b.fields.length ||
      b.fields.some((f: any) => !allTaskListFields.includes(f)) ||
      new Set(b.fields).size !== b.fields.length
    )
      throw new TaskListInputError(
        "Selecione os campos que serão armazenados.",
      );
    let existing: any;
    if (b.id) {
      existing = (
        await c.query(
          "SELECT * FROM web_service_task_lists WHERE id=$1 AND active FOR UPDATE",
          [listId(b.id)],
        )
      ).rows[0];
      if (!existing || existing.version !== b.version)
        throw new TaskListConflict(
          "A lista foi alterada ou excluída. Atualize para continuar.",
        );
    }
    if (
      (
        await c.query(
          "SELECT 1 FROM web_service_task_lists WHERE active AND lower(trim(name))=lower($1) AND ($2::uuid IS NULL OR id<>$2)",
          [b.name.trim(), b.id || null],
        )
      ).rows.length
    )
      throw new TaskListInputError("Já existe uma lista com esse nome.");
    const source = b.sourceScheduleId
      ? await sourceOperations(c, b.sourceScheduleId, b.expectedOperations)
      : null;
    const rows = source ? source.map((o) => o.document) : b.operations;
    const operations = await documents(c, rows, b.fields, settings);
    const document = {
      fields: allTaskListFields.filter((f) => b.fields.includes(f)),
      operations,
      ...(b.sourceScheduleId
        ? { sourceScheduleId: b.sourceScheduleId }
        : existing?.document.sourceScheduleId
          ? { sourceScheduleId: existing.document.sourceScheduleId }
          : {}),
    };
    const list = existing
      ? (
          await c.query(
            "UPDATE web_service_task_lists SET name=$2,document=$3,version=version+1,updated_at=now(),updated_by=$4 WHERE id=$1 RETURNING *",
            [existing.id, b.name.trim(), JSON.stringify(document), email],
          )
        ).rows[0]
      : (
          await c.query(
            "INSERT INTO web_service_task_lists(id,name,document,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING *",
            [randomUUID(), b.name.trim(), JSON.stringify(document), email],
          )
        ).rows[0];
    await audit(c, email, "service_task_list_saved", {
      before: existing || null,
      list,
    });
    return { list };
  }
  const list = (
    await c.query(
      "SELECT * FROM web_service_task_lists WHERE id=$1 AND active FOR UPDATE",
      [listId(b.id)],
    )
  ).rows[0];
  if (!list || list.version !== b.version)
    throw new TaskListConflict(
      "A lista foi alterada ou excluída. Atualize para continuar.",
    );
  if (b.action === "task_list_delete") {
    await c.query(
      "UPDATE web_service_task_lists SET active=false,version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1",
      [list.id, email],
    );
    await audit(c, email, "service_task_list_removed", { list });
    return { removed: list.id };
  }
  if (b.action !== "task_list_apply")
    throw new TaskListInputError("Ação inválida.");
  if (b.confirmReplace !== true)
    throw new TaskListInputError("Confirme a substituição das operações.");
  const rows = await sourceOperations(c, b.scheduleId, b.expectedOperations);
  if (
    rows.some(
      (o) =>
        o.sent_at ||
        !["pending", "planning", "scheduled"].includes(o.status) ||
        o.document.firstSentAt ||
        o.document.checklistRun ||
        o.document.reschedulingHistory?.length,
    )
  )
    throw new TaskListInputError(
      "Não é possível substituir operações já enviadas ao técnico ou com execução/relatório registrado.",
    );
  const ids = rows.map((o) => o.id);
  for (const table of [
    "web_field_sessions",
    "web_field_events",
    "web_field_material_checks",
    "web_field_time_requests",
    "web_service_checklist_photos",
  ]) {
    if (
      (
        await c.query(
          `SELECT 1 FROM ${table} WHERE operation_id=ANY($1::uuid[]) LIMIT 1`,
          [ids],
        )
      ).rows.length
    )
      throw new TaskListInputError(
        "A OS possui registros de execução, relatório ou apontamentos. As operações não podem ser substituídas.",
      );
  }
  if (
    (
      await c.query(
        "SELECT 1 FROM web_service_operation_events WHERE operation_id=ANY($1::uuid[]) AND (hours IS NOT NULL OR action IN ('send','work_log','activity','finish_full','finish_partial','review','complete')) LIMIT 1",
        [ids],
      )
    ).rows.length
  )
    throw new TaskListInputError(
      "A OS possui histórico de execução. As operações não podem ser substituídas.",
    );
  if (
    (
      await c.query(
        "SELECT 1 FROM web_service_item_usage WHERE schedule_id=$1 AND (operation_id=ANY($2::uuid[]) OR jsonb_array_length(COALESCE(allocations,'[]'))>0 OR COALESCE(withdrawn,0)>0 OR COALESCE(used,0)>0) LIMIT 1",
        [b.scheduleId, ids],
      )
    ).rows.length
  )
    throw new TaskListInputError(
      "A OS possui peças retiradas ou atribuídas às operações. Revise essas atribuições antes de substituir a programação.",
    );
  const next = await documents(
    c,
    list.document.operations,
    list.document.fields,
    settings,
  );
  const events = (
    await c.query(
      "SELECT * FROM web_service_operation_events WHERE operation_id=ANY($1::uuid[])",
      [ids],
    )
  ).rows;
  await c.query(
    "DELETE FROM web_service_operation_events WHERE operation_id=ANY($1::uuid[])",
    [ids],
  );
  await c.query("DELETE FROM web_service_operations WHERE schedule_id=$1", [
    b.scheduleId,
  ]);
  const operations = [];
  for (let i = 0; i < next.length; i++)
    operations.push(
      (
        await c.query(
          "INSERT INTO web_service_operations(id,schedule_id,position,document,status,updated_by) VALUES($1,$2,$3,$4,'pending',$5) RETURNING *",
          [randomUUID(), b.scheduleId, i + 1, JSON.stringify(next[i]), email],
        )
      ).rows[0],
    );
  await audit(c, email, "service_task_list_applied", {
    scheduleId: b.scheduleId,
    listId: list.id,
    listVersion: list.version,
    replaced: rows,
    events,
    operations,
  });
  return { operations };
}
