import "server-only";
import {resetWhatsAppPhone} from "./password-reset-notifications";
import { INITIAL_PASSWORD, needsPasswordChange, passwordValidation } from "./password-policy";
import { database } from "./db";
import { AdminInputError } from "./admin-store";
import type { AuthUser } from "./user-display-name";
export async function createEmployeeLogin(body: any, actor: AuthUser) {
  if(typeof body?.email!=="string")throw new AdminInputError("Informe o e-mail cadastrado.");
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
        password: INITIAL_PASSWORD,
        email_confirm: true,
        app_metadata: {must_change_password:true},
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
  if(typeof body?.email!=="string")throw new AdminInputError("Informe o e-mail cadastrado.");
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
    const phone=resetWhatsAppPhone(user.phone);
    if(!user.enabled)throw new AdminInputError("Libere o acesso do funcionário antes de redefinir sua senha.");
    if(!phone)throw new AdminInputError("Cadastre um WhatsApp válido para o funcionário antes de redefinir sua senha.");
    // Prepare the outbox before changing the external password; all DB work stays transactional.
    await c.query("UPDATE web_password_reset_notifications SET state='skipped' WHERE email=$1 AND state='pending'",[user.email]);
    await c.query('INSERT INTO web_password_reset_notifications(email,user_id,phone) VALUES($1,$2,$3)',[user.email,user.user_id,phone]);
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
      body: JSON.stringify({ password: INITIAL_PASSWORD, app_metadata:{...identity.app_metadata,must_change_password:true} }),
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

export async function changeInitialPassword(body:any,user:AuthUser) {
  const invalid=passwordValidation(body?.password,body?.confirmation);
  if(invalid)throw new AdminInputError(invalid);
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new AdminInputError('A troca de senha não está configurada no servidor.');
  const c=await database().connect();
  try{
    await c.query('BEGIN READ WRITE');
    await c.query('SELECT pg_advisory_xact_lock(81020,1)');
    const access=(await c.query('SELECT enabled FROM web_user_access WHERE email=$1 FOR UPDATE',[user.email.toLowerCase()])).rows[0];
    if(!access?.enabled)throw new AdminInputError('Acesso não autorizado.');
    const endpoint=`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`;
    const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
    const current=await fetch(endpoint,{headers,cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!current.ok)throw new AdminInputError('Não foi possível verificar a conta.');
    const identity=await current.json();
    if(identity.id!==user.id || identity.email?.toLowerCase()!==user.email.toLowerCase() || !needsPasswordChange(identity))throw new AdminInputError('Não há troca obrigatória pendente. Entre novamente no sistema.');
    const updated=await fetch(endpoint,{method:'PUT',headers,cache:'no-store',signal:AbortSignal.timeout(15000),body:JSON.stringify({password:body.password,app_metadata:{...identity.app_metadata,must_change_password:false}})});
    if(!updated.ok)throw new AdminInputError('Não foi possível alterar a senha. Confira os requisitos e tente novamente.');
    await c.query("UPDATE web_password_reset_notifications SET state='skipped' WHERE email=$1 AND state='pending'",[user.email]);
    await c.query("INSERT INTO web_access_events(event,email,actor) VALUES('password_changed',$1,$1)",[user.email]);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
