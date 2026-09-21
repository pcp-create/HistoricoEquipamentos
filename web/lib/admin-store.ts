import "server-only";
import { database } from "./db";
import { userDisplayName, type AuthUser } from "./user-display-name";
export async function accessRecord(email: string) {
  return (
    (
      await database().query(
        "SELECT role,enabled FROM web_user_access WHERE email=$1",
        [email.toLowerCase()],
      )
    ).rows[0] || null
  );
}
export async function recordActivity(
  user: AuthUser,
  event: "login" | "heartbeat" | "logout",
) {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query(
      `INSERT INTO web_user_access(email,display_name,user_id,updated_by) VALUES($1,$2,$3,$1) ON CONFLICT(email) DO UPDATE SET display_name=$2,user_id=$3`,
      [user.email.toLowerCase(), userDisplayName(user), user.id],
    );
    if (event === "login")
      await c.query(
        "UPDATE web_user_access SET last_login_at=now(),last_seen_at=now() WHERE email=$1",
        [user.email.toLowerCase()],
      );
    if (event === "heartbeat")
      await c.query(
        "UPDATE web_user_access SET last_seen_at=now() WHERE email=$1 AND (last_seen_at IS NULL OR last_seen_at<now()-interval '25 seconds')",
        [user.email.toLowerCase()],
      );
    if (event === "logout")
      await c.query(
        "UPDATE web_user_access SET last_logout_at=now() WHERE email=$1",
        [user.email.toLowerCase()],
      );
    if (event !== "heartbeat")
      await c.query(
        "INSERT INTO web_access_events(event,email,actor) VALUES($1,$2,$2)",
        [event, user.email.toLowerCase()],
      );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export class AdminInputError extends Error {}
export async function setAccess(body: any, actor: AuthUser) {
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !["admin", "user"].includes(body.role) ||
    typeof body.enabled !== "boolean"
  )
    throw new AdminInputError("Informe e-mail, perfil e situação válidos.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(81020,1)");
    const permission = (
      await c.query(
        "SELECT role,enabled FROM web_user_access WHERE email=$1 FOR UPDATE",
        [actor.email.toLowerCase()],
      )
    ).rows[0];
    if (!permission?.enabled || permission.role !== "admin")
      throw new AdminInputError("Permissão de administrador necessária.");
    const old = (
      await c.query("SELECT role,enabled FROM web_user_access WHERE email=$1", [
        email,
      ])
    ).rows[0];
    if (
      old?.role === "admin" &&
      old.enabled &&
      (body.role !== "admin" || !body.enabled)
    ) {
      const count = Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM web_user_access WHERE role='admin' AND enabled",
          )
        ).rows[0].n,
      );
      if (count <= 1)
        throw new AdminInputError(
          "Não é possível remover o último administrador ativo.",
        );
    }
    await c.query(
      `INSERT INTO web_user_access(email,role,enabled,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET role=$2,enabled=$3,updated_by=$4,updated_at=now()`,
      [email, body.role, body.enabled, actor.email],
    );
    await c.query(
      "INSERT INTO web_access_events(event,email,actor,details) VALUES('access_changed',$1,$2,$3)",
      [
        email,
        actor.email,
        JSON.stringify({
          before: old || null,
          after: { role: body.role, enabled: body.enabled },
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
export async function adminOverview() {
  const db = database();
  const users = (
    await db.query(`SELECT email,display_name,role,enabled,last_login_at,last_seen_at,last_logout_at,
 (enabled AND last_seen_at>now()-interval '15 minutes' AND (last_logout_at IS NULL OR last_seen_at>last_logout_at)) AS online FROM web_user_access ORDER BY role,email`)
  ).rows;
  const events = (
    await db.query(
      "SELECT event,email,actor,created_at,details FROM web_access_events ORDER BY created_at DESC,id DESC LIMIT 100",
    )
  ).rows;
  const orders = (
    await db.query(
      `SELECT company_id,max(inventory_seen_at) AS inventory_at,max(last_detail_at) AS detail_at,count(*) FILTER(WHERE pending)::int AS pending,count(*) FILTER(WHERE error IS NOT NULL)::int AS errors FROM integracao_m8_os_sync GROUP BY company_id ORDER BY company_id`,
    )
  ).rows;
  const products = (
    await db.query(
      "SELECT company_id,mode,cursor_at,full_at,success_at FROM m8_product_sync ORDER BY company_id,mode",
    )
  ).rows;
  const equipment = (
    await db.query(
      "SELECT company_id,catalog_at,seed_at,linked_at,(error IS NOT NULL) AS has_error FROM m8_equipment_sync ORDER BY company_id",
    )
  ).rows;
  const runs = (
    await db.query(
      "SELECT company_id,data_inicio,data_fim,status,registros_recebidos FROM integracao_m8_log ORDER BY data_inicio DESC LIMIT 30",
    )
  ).rows;
  return { users, events, orders, products, equipment, runs };
}
