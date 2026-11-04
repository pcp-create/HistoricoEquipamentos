import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "../db";
export async function queueServiceMessage(
  c: any,
  source: string,
  text: string,
  input: { recipient?: string; phone?: string },
) {
  await c.query(
    "INSERT INTO web_service_notifications(id,source_key,recipient,phone,text) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_key) DO NOTHING",
    [randomUUID(), source, input.recipient || null, input.phone || null, text],
  );
}
export async function claimServiceMessages() {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const rows = (
      await c.query(`SELECT n.*,COALESCE(n.phone,u.phone) number FROM web_service_notifications n LEFT JOIN web_user_access u ON u.email=n.recipient
 WHERE n.state='pending' AND n.attempts=0 AND (n.recipient IS NULL OR u.enabled)
 AND (n.source_key NOT LIKE 'schedule-dispatch:%' OR EXISTS(
   SELECT 1 FROM web_service_operations o JOIN web_service_schedules s ON s.id=o.schedule_id
   WHERE s.id::text=split_part(n.source_key,':',2) AND s.active AND o.sent_at IS NOT NULL
     AND o.document->>'responsible'=n.recipient AND o.status NOT IN('completed','reviewed','awaiting_review')
 )) AND COALESCE(n.phone,u.phone) ~ '^[1-9][0-9]{9,14}$' ORDER BY n.created_at LIMIT 20 FOR UPDATE OF n SKIP LOCKED`)
    ).rows;
    const result = [];
    for (const r of rows) {
      const token = randomUUID();
      await c.query(
        "UPDATE web_service_notifications SET attempts=attempts+1,lease_token=$2 WHERE id=$1",
        [r.id, token],
      );
      result.push({
        id: "service:" + r.id,
        token,
        number: r.number,
        text: r.text,
      });
    }
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function acknowledgeServiceMessage(id: unknown, token: unknown) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    typeof token !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(token)
  )
    throw Error("Confirmação inválida.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const r = await c.query(
      "UPDATE web_service_notifications SET state='sent',sent_at=COALESCE(sent_at,now()) WHERE id=$1 AND lease_token=$2 AND state IN('pending','sent') RETURNING id",
      [id, token],
    );
    if (!r.rows.length) throw Error("Aviso não reclamado.");
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
