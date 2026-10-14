import "server-only";
import { database } from "./db";
import { authRequest, Forbidden } from "./auth";
import type { AuthUser } from "./user-display-name";

export class PasswordInputError extends Error {}
export function validateNewPassword(body: any) {
  if (typeof body?.currentPassword !== "string" || !body.currentPassword || body.currentPassword.length > 256)
    throw new PasswordInputError("Informe sua senha atual.");
  if (typeof body.password !== "string" || body.password.length < 6 || body.password.length > 128)
    throw new PasswordInputError("A nova senha deve ter entre 6 e 128 caracteres.");
  if (body.password !== body.confirmation)
    throw new PasswordInputError("A confirmação não corresponde à nova senha.");
  if (body.password === "123456" || body.password === body.currentPassword)
    throw new PasswordInputError("Escolha uma senha diferente da senha atual e da senha padrão.");
}
export async function changeOwnPassword(body: any, user: AuthUser, request = authRequest) {
  validateNewPassword(body);
  const c=await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    // Serializes administrator resets with user changes.
    await c.query("SELECT pg_advisory_xact_lock(81020,1)");
    const access=(await c.query("SELECT enabled,user_id FROM web_user_access WHERE email=$1 FOR UPDATE",[user.email.toLowerCase()])).rows[0];
    if(!access?.enabled || (access.user_id && access.user_id!==user.id))throw new Forbidden();
    const verified=await request("token?grant_type=password",{email:user.email,password:body.currentPassword});
    if(!verified.ok)throw new PasswordInputError(verified.status===429?"Muitas tentativas. Aguarde alguns minutos.":"Senha atual incorreta.");
    const session=await verified.json();
    if(session.user?.id!==user.id || session.user?.email?.toLowerCase()!==user.email.toLowerCase() || !session.access_token)
      throw new Forbidden();
    const changed=await request("user",{password:body.password},session.access_token,"PUT");
    if(!changed.ok)throw new PasswordInputError("Não foi possível alterar a senha. Verifique os requisitos da autenticação e tente novamente.");
    await c.query("UPDATE web_user_access SET must_change_password=false,updated_at=now() WHERE email=$1",[user.email.toLowerCase()]);
    await c.query("INSERT INTO web_access_events(event,email,actor) VALUES('password_changed',$1,$1)",[user.email.toLowerCase()]);
    await c.query("COMMIT");
  } catch(e) {await c.query("ROLLBACK");throw e;} finally {c.release();}
}
