import "server-only";
import { database } from "./db";
import { AdminInputError } from "./admin-store";
import type { AuthUser } from "./user-display-name";
export async function createEmployeeLogin(body: any, actor: AuthUser) {
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.password.length < 6 ||
    body.password.length > 128
  )
    throw new AdminInputError(
      "Informe o e-mail cadastrado e uma senha inicial de 6 a 128 caracteres.",
    );
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new AdminInputError(
      "Configure SUPABASE_SERVICE_ROLE_KEY no servidor para criar contas de acesso.",
    );
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
    const user = (
      await c.query("SELECT * FROM web_user_access WHERE email=$1 FOR UPDATE", [
        body.email.trim().toLowerCase(),
      ])
    ).rows[0];
    if (!user?.enabled || !user.display_name)
      throw new AdminInputError(
        "Salve primeiro o funcionário com acesso liberado.",
      );
    if (user.user_id)
      throw new AdminInputError(
        "Este funcionário já possui conta vinculada. A senha existente foi preservada.",
      );
    const response = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: user.display_name },
      }),
    });
    if (!response.ok)
      throw new AdminInputError(
        "Não foi possível criar a conta. Se esse e-mail já possui login, use a senha existente; nenhuma senha foi alterada. Confira também a configuração do Supabase.",
      );
    const created = await response.json();
    if (!created.id) throw Error("Missing identity");
    await c.query("UPDATE web_user_access SET user_id=$2 WHERE email=$1", [
      user.email,
      created.id,
    ]);
    await c.query(
      "INSERT INTO web_access_events(event,email,actor) VALUES('account_created',$1,$2)",
      [user.email, actor.email],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function resetEmployeePassword(body: any, actor: AuthUser) {
  if (
    typeof body?.email !== "string" ||
    typeof body.password !== "string" ||
    body.password.length < 6 ||
    body.password.length > 128 ||
    body.password !== body.passwordConfirmation
  ) throw new AdminInputError("Informe e confirme a nova senha, de 6 a 128 caracteres.");
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new AdminInputError("A redefinição de senhas precisa ser configurada no servidor.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query("SELECT pg_advisory_xact_lock(81020,1)");
    const permission = (await c.query(
      "SELECT role,enabled FROM web_user_access WHERE email=$1 FOR UPDATE",
      [actor.email.toLowerCase()],
    )).rows[0];
    if (!permission?.enabled || permission.role !== "admin")
      throw new AdminInputError("Permissão de administrador necessária.");
    const user = (await c.query(
      "SELECT * FROM web_user_access WHERE email=$1 FOR UPDATE",
      [body.email.trim().toLowerCase()],
    )).rows[0];
    if (!user?.user_id)
      throw new AdminInputError("Este funcionário ainda não possui uma conta de acesso vinculada.");
    const endpoint = `${url}/auth/v1/admin/users/${encodeURIComponent(user.user_id)}`;
    const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const identityResponse = await fetch(endpoint, {
      headers, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!identityResponse.ok)
      throw new AdminInputError("Não foi possível localizar a conta de acesso. Tente novamente.");
    const identity = await identityResponse.json();
    if (identity.id !== user.user_id || identity.email?.toLowerCase() !== user.email.toLowerCase())
      throw new AdminInputError("A conta vinculada não corresponde ao e-mail do funcionário.");
    const response = await fetch(endpoint, {
      method: "PUT", headers, cache: "no-store", signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ password: body.password }),
    });
    if (!response.ok)
      throw new AdminInputError("Não foi possível redefinir a senha. Verifique os requisitos de senha da autenticação e tente novamente.");
    await c.query(
      "INSERT INTO web_access_events(event,email,actor) VALUES('password_reset',$1,$2)",
      [user.email, actor.email],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
