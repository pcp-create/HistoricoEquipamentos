import "server-only";
import { database } from "../db";
import { m8Session } from "./m8";
import { positiveId, OrderInputError } from "./model";
export async function orderLookups(p: URLSearchParams) {
  const db = database(),
    kind = p.get("lookup");
  if (kind === "metadata") {
    const [types, registries, users] = await Promise.all([
      db.query(
        "SELECT id::text,name,customer_equipment_only FROM m8_order_type_catalog WHERE active ORDER BY m8_order_type_catalog.id",
      ),
      db.query(
        "SELECT kind,id::text,name,warranty_id,warranty_description FROM service_order_registries WHERE active ORDER BY service_order_registries.id,kind",
      ),
      db.query(
        "SELECT email,COALESCE(NULLIF(display_name,''),email) AS name,m8_employee_id FROM web_user_access WHERE enabled ORDER BY m8_employee_id ASC NULLS LAST,name,email",
      ),
    ]);
    return {
      types: types.rows,
      registries: registries.rows,
      users: users.rows,
    };
  }
  if (kind === "sellers") {
    const company = positiveId(p.get("company"), "a empresa"),
      id = positiveId(p.get("customer"), "o cliente");
    const m = await m8Session(company);
    const rows = await m(
      `/v1/configuracoes/cliente/${id}/vendedor?Page=0&PageSize=0`,
    );
    if (!Array.isArray(rows))
      throw new Error("Consulta de vendedores indisponível.");
    const sellers = rows
      .filter((r) => Number.isInteger(r.vendedorId) && r.vendedorId > 0)
      .map((r) => ({
        id: String(r.vendedorId),
        name: r.vendedorNome || String(r.vendedorId),
        default: r.padrao === true,
      }));
    return { rows: [...new Map(sellers.map((r) => [r.id, r])).values()].sort((a,b)=>Number(a.id)-Number(b.id)) };
  }
  const q =
    "%" +
    (p.get("q") || "")
      .trim()
      .slice(0, 120)
      .replace(/[\\%_]/g, "\\$&") +
    "%";
  const page = Number(p.get("page") || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new OrderInputError("Página inválida.");
  if (kind === "customers")
    return {
      rows: (
        await db.query(
          `SELECT person_id::text id,concat_ws(' · ',person_id,name,document) name FROM m8_customer_directory WHERE company_id=1 AND concat_ws(' ',person_id,name,document) ILIKE $1 ORDER BY person_id LIMIT 31 OFFSET $2`,
          [q, (page - 1) * 30],
        )
      ).rows,
    };
  if (kind === "equipment") {
    const type = positiveId(p.get("type"), "o tipo de OS"),
      customer = positiveId(p.get("customer"), "o cliente");
    const t = (
      await db.query(
        "SELECT customer_equipment_only FROM m8_order_type_catalog WHERE id=$1 AND active",
        [type],
      )
    ).rows[0];
    if (!t || t.customer_equipment_only == null)
      throw new OrderInputError(
        "Atualize o cadastro de tipos de OS antes de selecionar o equipamento.",
      );
    return {
      rows: (
        await db.query(
          `SELECT e.equipment_id::text id,concat_ws(' · ',e.equipment_id,e.name,NULLIF(e.model,''),NULLIF(e.serial,'')) name FROM m8_equipment_catalog e WHERE e.present AND concat_ws(' ',e.equipment_id,e.name,e.model,e.serial) ILIKE $1 AND (NOT $2::boolean OR EXISTS(SELECT 1 FROM m8_person_equipment p WHERE p.company_id=1 AND p.person_id=$3 AND p.equipment_id=e.equipment_id AND p.present)) ORDER BY e.equipment_id LIMIT 31 OFFSET $4`,
          [q, t.customer_equipment_only, customer, (page - 1) * 30],
        )
      ).rows,
    };
  }
  throw new OrderInputError("Consulta inválida.");
}
