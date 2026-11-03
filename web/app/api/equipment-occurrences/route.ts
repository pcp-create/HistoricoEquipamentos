import { accessRecord } from "@/lib/admin-store";
import {
  requireUser,
  requireAdmin,
  sameOrigin,
  Unauthorized,
  Forbidden,
} from "@/lib/auth";
import { database } from "@/lib/db";
import {
  createOccurrence,
  deleteOccurrence,
  createOperationOccurrence,
  equipmentKey,
  occurrencesForEquipment,
  OccurrenceInputError,
} from "@/lib/equipment-occurrences/store";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(e: unknown) {
  if (e instanceof Forbidden)
    return json(
      { error: "Somente administradores podem excluir um B.O." },
      403,
    );
  if (e instanceof Unauthorized)
    return json({ error: "Sessão expirada." }, 401);
  if (e instanceof OccurrenceInputError) return json({ error: e.message }, 400);
  console.error(
    "EQUIPMENT_OCCURRENCE_FAILED",
    e instanceof Error ? e.name : "Error",
  );
  return json(
    { error: "Não foi possível acessar os boletins de ocorrência." },
    503,
  );
}
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const access = await accessRecord(user.email);
    const canDelete = access?.enabled === true && access.role === "admin";
    const p = new URL(req.url).searchParams;
    const id = p.get("equipment");
    if (id)
      return json({
        canDelete,
        items: await occurrencesForEquipment(database(), [equipmentKey(id)]),
      });
    if (p.has("lookup"))
      return json({
        equipment: (
          await database().query(
            "SELECT equipment_id::text AS id,name,serial FROM m8_equipment_catalog WHERE equipment_id=$1",
            [equipmentKey(p.get("lookup"))],
          )
        ).rows,
      });
    if (!p.has("q"))
      return json({
        canDelete,
        items: (
          await database().query(
            `SELECT b.id,b.equipment_id::text,b.occurred_on::text,b.title,b.description,b.created_at,COALESCE(NULLIF(u.display_name,''),b.created_by) AS author,e.name AS equipment_name,e.serial FROM web_equipment_occurrences b JOIN m8_equipment_catalog e USING(equipment_id) LEFT JOIN web_user_access u ON u.email=b.created_by ORDER BY b.occurred_on DESC,b.created_at DESC,b.id LIMIT 100`,
          )
        ).rows,
      });
    const q = (p.get("q") || "").trim().slice(0, 160);
    if (q.length < 2) return json({ equipment: [] });
    return json({
      equipment: (
        await database().query(
          `SELECT equipment_id::text AS id,name,serial,brand,model FROM m8_equipment_catalog WHERE present AND (name ILIKE $1 OR serial ILIKE $1 OR equipment_id::text=$2) ORDER BY name,equipment_id LIMIT 50`,
          ["%" + q.replace(/[\\%_]/g, "\\$&") + "%", q],
        )
      ).rows,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  let c;
  try {
    const user = await requireUser();
    const raw = await req.text();
    if (raw.length > 20000)
      return json({ error: "Dados excedem o limite." }, 413);
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new OccurrenceInputError("Dados inválidos.");
    }
    c = await database().connect();
    await c.query("BEGIN READ WRITE");
    const result =
      input?.operationId !== undefined
        ? await createOperationOccurrence(c, input, user.email)
        : await createOccurrence(c, input, user.email);
    await c.query("COMMIT");
    return json(result, 201);
  } catch (e) {
    if (c) await c.query("ROLLBACK");
    return failure(e);
  } finally {
    c?.release();
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida." }, 403);
  let c;
  try {
    const user = await requireAdmin();
    const id = new URL(req.url).searchParams.get("id");
    c = await database().connect();
    await c.query("BEGIN READ WRITE");
    const result = await deleteOccurrence(c, id, user.email);
    await c.query("COMMIT");
    return json(result);
  } catch (e) {
    if (c) await c.query("ROLLBACK");
    return failure(e);
  } finally {
    c?.release();
  }
}
