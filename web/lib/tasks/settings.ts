import "server-only";
import { assignmentLocked, assignmentLockReason } from "./assignment-policy";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
export async function taskSettings() {
  const rules = (
    await database().query(
      `SELECT r.*,u.display_name,u.enabled FROM web_task_origin_rules r LEFT JOIN web_user_access u ON u.email=r.assignee ORDER BY r.origin`,
    )
  ).rows;
  const users = (
    await database().query(
      `SELECT email,display_name FROM web_user_access WHERE enabled ORDER BY display_name,email`,
    )
  ).rows;
  return { rules, users };
}
export async function saveTaskSettings(b: any, actor: string) {
  if (
    typeof b?.origin !== "string" ||
    !Number.isInteger(b.version) ||
    !(b.assignee === null || typeof b.assignee === "string")
  )
    throw new AdminInputError("Regra inválida.");
  if (assignmentLocked(b.origin))
    throw new AdminInputError(assignmentLockReason);
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const old = (
      await c.query(
        "SELECT * FROM web_task_origin_rules WHERE origin=$1 FOR UPDATE",
        [b.origin],
      )
    ).rows[0];
    if (!old || old.version !== b.version)
      throw new AdminInputError(
        "Regra indisponível ou alterada. Atualize a página.",
      );
    if (
      b.assignee &&
      !(
        await c.query(
          "SELECT email FROM web_user_access WHERE email=$1 AND enabled FOR SHARE",
          [b.assignee],
        )
      ).rows.length
    )
      throw new AdminInputError("Selecione um funcionário ativo.");
    await c.query(
      "UPDATE web_task_origin_rules SET assignee=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE origin=$1",
      [b.origin, b.assignee || null, actor],
    );
    await c.query(
      "INSERT INTO web_access_events(event,email,actor,details) VALUES('task_origin_rule',$1,$1,$2)",
      [
        actor,
        JSON.stringify({
          before: old,
          after: { origin: b.origin, assignee: b.assignee || null },
        }),
      ],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
