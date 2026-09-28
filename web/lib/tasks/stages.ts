import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
export async function taskStages() {
  const stages = (
    await database().query(
      "SELECT * FROM web_task_stages ORDER BY lower(job_title),sort_order,lower(name),id",
    )
  ).rows;
  const roles = (
    await database().query(
      "SELECT DISTINCT btrim(job_title) job_title FROM web_user_access WHERE btrim(job_title)<>'' ORDER BY 1",
    )
  ).rows.map((r) => r.job_title);
  return { stages, roles };
}
export async function saveTaskStage(b: any, actor: string) {
  if (!b || !["save", "delete"].includes(b.action))
    throw new AdminInputError("Ação inválida.");
  if (
    b.id != null &&
    (typeof b.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        b.id,
      ) ||
      !Number.isInteger(b.version))
  )
    throw new AdminInputError("Etapa inválida. Atualize a lista.");
  const role = typeof b.job_title === "string" ? b.job_title.trim() : "",
    name = typeof b.name === "string" ? b.name.trim() : "";
  if (
    b.action === "save" &&
    (!role ||
      role.length > 120 ||
      !name ||
      name.length > 160 ||
      !Number.isInteger(b.sort_order) ||
      b.sort_order < 1 ||
      b.sort_order > 9999)
  )
    throw new AdminInputError(
      "Informe cargo, etapa e uma ordem entre 1 e 9.999.",
    );
  if (b.action === "delete" && !b.id)
    throw new AdminInputError("Selecione uma etapa.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(724026)");
    const before = b.id
      ? (
          await c.query(
            "SELECT * FROM web_task_stages WHERE id=$1 FOR UPDATE",
            [b.id],
          )
        ).rows[0]
      : null;
    if (b.id && (!before || before.version !== b.version))
      throw new AdminInputError(
        "Esta etapa foi alterada ou removida por outro usuário. Atualize a lista.",
      );
    let stage = null;
    if (b.action === "delete")
      await c.query("DELETE FROM web_task_stages WHERE id=$1", [b.id]);
    else if (b.id)
      stage = (
        await c.query(
          "UPDATE web_task_stages SET job_title=$2,name=$3,sort_order=$4,version=version+1,updated_by=$5,updated_at=now() WHERE id=$1 RETURNING *",
          [b.id, role, name, b.sort_order, actor],
        )
      ).rows[0];
    else
      stage = (
        await c.query(
          "INSERT INTO web_task_stages(id,job_title,name,sort_order,updated_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [randomUUID(), role, name, b.sort_order, actor],
        )
      ).rows[0];
    await c.query(
      "INSERT INTO web_access_events(event,email,actor,details) VALUES('task_stage',$1,$1,$2)",
      [actor, JSON.stringify({ action: b.action, before, after: stage })],
    );
    await c.query("COMMIT");
    return stage;
  } catch (e) {
    await c.query("ROLLBACK");
    if (["23503", "23001"].includes((e as any).code))
      throw new AdminInputError(
        "Esta etapa está vinculada a tarefas. Altere a etapa dessas tarefas antes de removê-la.",
      );
    if ((e as any).code === "23505")
      throw new AdminInputError(
        (e as any).constraint === "web_task_stages_order"
          ? "Esta ordem já está sendo usada por outra etapa deste cargo. Escolha outra ordem."
          : "Já existe uma etapa com esse nome para este cargo.",
      );
    throw e;
  } finally {
    c.release();
  }
}

export async function reorderTaskStages(b: any, actor: string) {
  if (
    !Array.isArray(b.stages) ||
    !b.stages.length ||
    b.stages.length > 9999 ||
    b.stages.some(
      (r: any) =>
        !r ||
        typeof r.id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(r.id) ||
        !Number.isInteger(r.version),
    ) ||
    new Set(b.stages.map((r: any) => r.id)).size !== b.stages.length
  )
    throw new AdminInputError("Ordem inválida. Atualize a lista.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(724026)");
    const first = (
      await c.query("SELECT job_title_key FROM web_task_stages WHERE id=$1", [
        b.stages[0].id,
      ])
    ).rows[0];
    if (!first) throw new AdminInputError("Etapa removida. Atualize a lista.");
    const before = (
      await c.query(
        "SELECT * FROM web_task_stages WHERE job_title_key=$1 ORDER BY sort_order,id FOR UPDATE",
        [first.job_title_key],
      )
    ).rows;
    if (
      before.length !== b.stages.length ||
      b.stages.some(
        (r: any) =>
          !before.some((old) => old.id === r.id && old.version === r.version),
      )
    )
      throw new AdminInputError(
        "As etapas foram alteradas por outro usuário. Atualize a lista.",
      );
    await c.query("SET CONSTRAINTS web_task_stages_order DEFERRED");
    await c.query(
      `UPDATE web_task_stages s SET sort_order=o.position::int,version=s.version+1,updated_at=now(),updated_by=$2 FROM unnest($1::uuid[]) WITH ORDINALITY o(id,position) WHERE s.id=o.id`,
      [b.stages.map((r: any) => r.id), actor],
    );
    const stages = (
      await c.query(
        "SELECT * FROM web_task_stages WHERE job_title_key=$1 ORDER BY sort_order",
        [first.job_title_key],
      )
    ).rows;
    await c.query(
      "INSERT INTO web_access_events(event,email,actor,details) VALUES('task_stage_reorder',$1,$1,$2)",
      [actor, JSON.stringify({ before, after: stages })],
    );
    await c.query("COMMIT");
    return stages;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
