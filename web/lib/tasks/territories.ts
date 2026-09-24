import "server-only";
import { assignNewRentalTasks } from "./rental-assignment";
import type { PoolClient } from "pg";
import { database } from "../db";
import { AdminInputError } from "../admin-store";
export const cityKey = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const states = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(
    " ",
  ),
);
export async function territoryList() {
  return {
    rules: (
      await database().query(
        "SELECT t.*,u.display_name,u.enabled FROM web_task_territories t JOIN web_user_access u ON u.email=t.assignee ORDER BY t.uf,t.city",
      )
    ).rows,
    users: (
      await database().query(
        "SELECT email,display_name FROM web_user_access WHERE enabled ORDER BY display_name,email",
      )
    ).rows,
  };
}
export async function saveTerritory(b: any, email: string) {
  if (!["save", "delete"].includes(b?.action))
    throw new AdminInputError("Operação inválida.");
  if (
    b.id != null &&
    (!/^\d+$/.test(String(b.id)) || !Number.isInteger(b.version))
  )
    throw new AdminInputError("Registro inválido.");
  const city = typeof b.city === "string" ? b.city.trim() : "",
    uf = String(b.uf || "").toUpperCase(),
    assignee = String(b.assignee || "")
      .toLowerCase()
      .trim();
  if (b.action === "delete" && !b.id)
    throw new AdminInputError("Informe o registro.");
  if (
    b.action === "save" &&
    (!cityKey(city) || city.length > 150 || !states.has(uf))
  )
    throw new AdminInputError("Informe cidade e UF válidas.");
  const details: Record<string, string | undefined> = {};
  for (const field of ["mesoregion", "microregion", "seller"]) {
    if (
      b[field] !== undefined &&
      (typeof b[field] !== "string" || b[field].length > 150)
    )
      throw new AdminInputError(
        "Região e vendedor devem ter até 150 caracteres.",
      );
    details[field] = b[field]?.trim();
  }
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const old = b.id
      ? (
          await c.query(
            "SELECT * FROM web_task_territories WHERE id=$1 FOR UPDATE",
            [b.id],
          )
        ).rows[0]
      : null;
    if (b.id && (!old || old.version !== b.version))
      throw new AdminInputError(
        "Registro alterado. Atualize a lista antes de salvar.",
      );
    if (b.action === "delete")
      await c.query("DELETE FROM web_task_territories WHERE id=$1", [b.id]);
    else {
      const u = (
        await c.query(
          "SELECT enabled FROM web_user_access WHERE email=$1 FOR SHARE",
          [assignee],
        )
      ).rows[0];
      if (!u?.enabled) throw new AdminInputError("Selecione um usuário ativo.");
      if (b.id)
        await c.query(
          "UPDATE web_task_territories SET city=$2,city_key=$3,uf=$4,assignee=$5,version=version+1,updated_at=now(),updated_by=$6,mesoregion=coalesce($7,mesoregion),microregion=coalesce($8,microregion),seller=coalesce($9,seller) WHERE id=$1",
          [
            b.id,
            city,
            cityKey(city),
            uf,
            assignee,
            email,
            details.mesoregion,
            details.microregion,
            details.seller,
          ],
        );
      else
        await c.query(
          "INSERT INTO web_task_territories(city,city_key,uf,assignee,updated_by,mesoregion,microregion,seller) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            city,
            cityKey(city),
            uf,
            assignee,
            email,
            details.mesoregion ?? "",
            details.microregion ?? "",
            details.seller ?? "",
          ],
        );
    }
    await c.query(
      "INSERT INTO web_access_events(event,email,actor,details) VALUES('task_territory',$1,$1,$2)",
      [
        email,
        JSON.stringify({
          action: b.action,
          before: old,
          after:
            b.action === "delete" ? null : { city, uf, assignee, ...details },
        }),
      ],
    );
    await c.query("COMMIT");
  } catch (e: any) {
    await c.query("ROLLBACK");
    if (e.code === "23505")
      throw new AdminInputError("Já existe uma regra para esta cidade e UF.");
    throw e;
  } finally {
    c.release();
  }
}
export async function assignNewTasks(c: PoolClient, taskIds: string[]) {
  await assignNewRentalTasks(c, taskIds);
  const rules = (
    await c.query(
      "SELECT t.*,u.enabled,u.display_name FROM web_task_territories t JOIN web_user_access u ON u.email=t.assignee",
    )
  ).rows;
  if (!rules.length || !taskIds.length) return;
  const tasks = (
    await c.query(
      "SELECT id,equipment_id::text equipment_id FROM web_tasks WHERE id=ANY($1::bigint[]) AND origin='Preventiva de Equipamento de Cliente' AND assigned_to IS NULL",
      [taskIds],
    )
  ).rows;
  if (!tasks.length) return;
  const links = (
    await c.query(
      `SELECT p.equipment_id::text equipment_id,d.payload->>'municipioNome' city,d.payload->>'ufSigla' uf FROM m8_person_equipment p LEFT JOIN m8_customer_directory d ON d.company_id=p.company_id AND d.person_id=p.person_id WHERE p.present AND p.equipment_id=ANY($1::bigint[])`,
      [tasks.map((t) => t.equipment_id)],
    )
  ).rows;
  const byPlace = new Map(rules.map((r) => [r.city_key + ":" + r.uf, r]));
  const assignments = [];
  for (const t of tasks) {
    const customers = links.filter((l) => l.equipment_id === t.equipment_id);
    const matched = customers.map((l) =>
      byPlace.get(
        cityKey(l.city || "") + ":" + String(l.uf || "").toUpperCase(),
      ),
    );
    if (
      !matched.length ||
      matched.some((r) => !r?.enabled) ||
      new Set(matched.map((r) => r.assignee)).size !== 1
    )
      continue;
    assignments.push({
      id: String(t.id),
      email: matched[0].assignee,
      name: matched[0].display_name || "Funcionário sem nome cadastrado",
    });
  }
  if (!assignments.length) return;
  const payload = JSON.stringify(assignments);
  await c.query(
    `UPDATE web_tasks t SET assigned_to=x.email,status='in_progress',first_assigned_at=now() FROM jsonb_to_recordset($1::jsonb) x(id bigint,email text) WHERE t.id=x.id`,
    [payload],
  );
  await c.query(
    `INSERT INTO web_task_notes(task_id,title,description,automatic,created_by,created_name) SELECT x.id,'Atribuição automática','Atribuído a: '||x.name||'. Regra de cidade/UF do cliente.',true,'Sistema','Sistema' FROM jsonb_to_recordset($1::jsonb) x(id bigint,name text)`,
    [payload],
  );
  await c.query(
    `INSERT INTO web_task_notifications(task_id,task_version,recipient) SELECT x.id,1,x.email FROM jsonb_to_recordset($1::jsonb) x(id bigint,email text)`,
    [payload],
  );
}
