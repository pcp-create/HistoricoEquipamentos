import "server-only";
import { database } from "../db";
import { Forbidden } from "../auth";
import { AdminInputError } from "../admin-store";
async function access(db: any, email: string) {
  if (
    !(
      await db.query(
        "SELECT 1 FROM web_user_access WHERE email=$1 AND enabled",
        [email],
      )
    ).rows.length
  )
    throw new Forbidden();
}
export async function listJobTypes(email: string, all = false) {
  const db = database();
  await access(db, email);
  return (
    await db.query(
      `SELECT id::text,name,m8_id,m8_user_id,active,excluded,version FROM web_contact_job_types ${all ? "" : "WHERE active AND NOT excluded"} ORDER BY lower(name),id`,
    )
  ).rows;
}
export async function selectedJobType(db: any, id: unknown) {
  if (typeof id !== "string" || !/^\d{1,18}$/.test(id))
    throw new AdminInputError("Selecione o cargo do contato.");
  const row = (
    await db.query(
      "SELECT id,name,m8_id FROM web_contact_job_types WHERE id=$1 AND active AND NOT excluded",
      [id],
    )
  ).rows[0];
  if (!row)
    throw new AdminInputError(
      "Selecione um cargo ativo cadastrado em Tipos de Cargo.",
    );
  return row;
}
export async function saveJobType(b: any, email: string) {
  const name = typeof b?.name === "string" ? b.name.trim() : "",
    m8 = Number(b?.m8_id);
  if (
    !name ||
    name.length > 160 ||
    !Number.isInteger(m8) ||
    m8 < 1 ||
    m8 > 2147483647 ||
    typeof b.active !== "boolean"
  )
    throw new AdminInputError(
      "Informe a descrição e um ID de cargo M8 válido.",
    );
  if (
    b.id &&
    (!/^\d{1,18}$/.test(String(b.id)) || !Number.isSafeInteger(b.version))
  )
    throw new AdminInputError("Cadastro inválido.");
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    await access(c, email);
    const row = (
      await c.query(
        b.id
          ? "UPDATE web_contact_job_types SET name=$2,m8_id=$3,active=$4,updated_by=$5,updated_at=now(),version=version+1 WHERE id=$1 AND version=$6 AND NOT excluded RETURNING id::text,name,m8_id,active,version"
          : "INSERT INTO web_contact_job_types(name,m8_id,active,updated_by) VALUES($1,$2,$3,$4) RETURNING id::text,name,m8_id,active,version",
        b.id
          ? [b.id, name, m8, b.active, email, b.version]
          : [name, m8, b.active, email],
      )
    ).rows[0];
    if (!row)
      throw new AdminInputError(
        "Este cargo foi alterado. Atualize a lista antes de editar.",
      );
    await c.query("COMMIT");
    return row;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as any)?.code === "23505")
      throw new AdminInputError("O ID M8 já está cadastrado.");
    throw e;
  } finally {
    c.release();
  }
}
