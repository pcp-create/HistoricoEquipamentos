import "server-only";
import { database } from "../db";
import { m8Session, M8RequestError } from "./m8";
import {
  parseOrder,
  OrderInputError,
  itemPayload,
  brazilNow,
  extraPayload,
} from "./model";
import { orderLookups } from "./lookups";
const validUUID = (id: unknown) => {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new OrderInputError("Identificador inválido.");
  return id;
};
function publicSubmission(r: any) {
  return {
    id: r.id,
    company: r.company_id,
    m8Id: r.m8_id,
    state: r.state,
    nextItem: r.next_item,
    itemCount: r.items.length,
    message: r.message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export async function submissions(email: string, id?: string) {
  const result = await database().query(
    `SELECT * FROM service_order_submissions WHERE created_by=$1 ${id ? "AND id=$2" : ""} ORDER BY created_at DESC LIMIT 20`,
    id ? [email, validUUID(id)] : [email],
  );
  return result.rows.map(publicSubmission);
}
export async function prepareOrder(email: string, id: unknown, input: unknown) {
  const key = validUUID(id),
    draft = parseOrder(input),
    db = database();
  const existing = (
    await db.query("SELECT * FROM service_order_submissions WHERE id=$1", [key])
  ).rows[0];
  if (existing) {
    if (
      existing.created_by !== email ||
      canonical(existing.request) !== canonical(draft)
    )
      throw new OrderInputError(
        "Este envio já possui outros dados. Consulte o andamento antes de reenviar.",
      );
    return publicSubmission(existing);
  }
  const [types, regs, users, equip, customer] = await Promise.all([
    db.query("SELECT * FROM m8_order_type_catalog WHERE id=$1 AND active", [
      draft.type,
    ]),
    db.query("SELECT * FROM service_order_registries WHERE active"),
    db.query(
      "SELECT m8_employee_id FROM web_user_access WHERE email=$1 AND enabled",
      [draft.technician],
    ),
    db.query(
      "SELECT * FROM m8_equipment_catalog WHERE equipment_id=$1 AND present",
      [draft.equipment],
    ),
    db.query(
      "SELECT person_id FROM m8_customer_directory WHERE company_id=1 AND person_id=$1",
      [draft.customer],
    ),
  ]);
  const type = types.rows[0],
    technician = users.rows[0]?.m8_employee_id,
    equipment = equip.rows[0];
  if (!type || type.customer_equipment_only == null)
    throw new OrderInputError("Atualize e selecione um tipo de OS ativo.");
  if (!customer.rows.length || !equipment)
    throw new OrderInputError("Selecione cliente e equipamento válidos.");
  if (draft.technician && !technician)
    throw new OrderInputError(
      "Configure o ID do técnico no M8 no cadastro do usuário.",
    );
  if (
    type.customer_equipment_only &&
    !(
      await db.query(
        "SELECT 1 FROM m8_person_equipment WHERE company_id=1 AND person_id=$1 AND equipment_id=$2 AND present LIMIT 1",
        [draft.customer, draft.equipment],
      )
    ).rows.length
  )
    throw new OrderInputError(
      "O equipamento não pertence ao cliente selecionado.",
    );
  const reg = (kind: string, id: string) => {
    const r = regs.rows.find((r) => r.kind === kind && String(r.id) === id);
    if (!r)
      throw new OrderInputError(
        "Selecione opções ativas nos cadastros de atendimento, pagamento, situação e frete.",
      );
    return r;
  };
  const service = reg("service-types", draft.serviceType);
  reg("service-origins", draft.origin);
  reg("payment-terms", draft.payment);
  reg("order-statuses", draft.situation);
  reg("flow-statuses", draft.flowStatus);
  reg("freight", draft.freight);
  if (!service.warranty_id || !service.warranty_description)
    throw new OrderInputError(
      "Configure o prazo de garantia no tipo de atendimento.",
    );
  const sellers = await orderLookups(
    new URLSearchParams({
      lookup: "sellers",
      company: draft.company,
      customer: draft.customer,
    }),
  );
  if (
    !("rows" in sellers) ||
    !sellers.rows?.some((r: any) => r.id === draft.seller)
  )
    throw new OrderInputError(
      "O vendedor não está cadastrado para este cliente.",
    );
  for (const kind of ["material", "service"]) {
    const ids = draft.items.filter((i) => i.kind === kind).map((i) => i.code);
    if (!ids.length) continue;
    const table =
        kind === "material" ? "m8_product_catalog" : "m8_service_catalog",
      field = kind === "material" ? "product_id" : "service_id";
    const found = await db.query(
      `SELECT DISTINCT ${field}::text id FROM ${table} WHERE ${field}=ANY($1::bigint[]) AND company_id IN(1,2,27404)`,
      [ids],
    );
    if (found.rows.length !== ids.length)
      throw new OrderInputError(
        "Um produto ou serviço não consta no catálogo M8.",
      );
  }
  const header = {
    ...extraPayload(draft.extra),
    tipoId: Number(draft.type),
    clienteId: Number(draft.customer),
    funcionarioId: Number(draft.seller),
    ...(technician ? { responsavelTecnicoId: technician } : {}),
    condicaoPagamentoId: Number(draft.payment),
    emissao: brazilNow(),
    dataEntregaPrevista: draft.expected + "T00:00:00-03:00",
    dataEntrega: draft.delivery + "T00:00:00-03:00",
    tipoAtendimentoId: Number(draft.serviceType),
    origemId: Number(draft.origin),
    situacaoId: Number(draft.situation),
    freteId: Number(draft.freight),
    tipoGarantiaId: service.warranty_id,
    observacao: draft.notes,
    observacaoInterna: draft.internalNotes,
  };
  // Equipment is a separate persisted step; never also include it in the header.
  // Previously prepared submissions retain their original header/steps unchanged.
  const items = [
    {
      kind: "equipment",
      payload: {
        equipamentoProdutoId: Number(draft.equipment),
        ...(equipment.payload?.equipamentoId
          ? { equipamentoId: Number(equipment.payload.equipamentoId) }
          : {}),
        numeroSerie: equipment.serial || undefined,
        equipamentoModelo: equipment.model || undefined,
        ...(technician ? { tecnicoId: technician } : {}),
      },
    },
    ...draft.items.map((i) => ({
      kind: i.kind,
      payload: itemPayload(i, technician),
    })),
    {
      kind: "flow-status",
      payload: { statusFluxoId: Number(draft.flowStatus) },
    },
  ];
  const c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    await c.query(
      "INSERT INTO service_order_submissions(id,created_by,company_id,request,header,items) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
      [
        key,
        email,
        Number(draft.company),
        JSON.stringify(draft),
        JSON.stringify(header),
        JSON.stringify(items),
      ],
    );
    const r = (
      await c.query("SELECT * FROM service_order_submissions WHERE id=$1", [
        key,
      ])
    ).rows[0];
    if (r.created_by !== email || canonical(r.request) !== canonical(draft))
      throw new OrderInputError("Identificador de envio já utilizado.");
    await c.query("COMMIT");
    return publicSubmission(r);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
function canonical(v: any): string {
  return JSON.stringify(v, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}
// One ERP write per request. The persisted sending state survives a server timeout/crash.
export async function advanceOrder(
  email: string,
  id: unknown,
  session = m8Session,
) {
  const key = validUUID(id),
    db = database();
  let row = (
    await db.query(
      "SELECT * FROM service_order_submissions WHERE id=$1 AND created_by=$2",
      [key, email],
    )
  ).rows[0];
  if (!row) throw new OrderInputError("Envio não encontrado.");
  if (["sending", "uncertain", "complete", "rejected"].includes(row.state))
    return publicSubmission(row);
  const m8 = await session(row.company_id);
  const c = await db.connect();
  try {
    await c.query("BEGIN READ WRITE");
    row = (
      await c.query(
        "SELECT * FROM service_order_submissions WHERE id=$1 AND created_by=$2 FOR UPDATE",
        [key, email],
      )
    ).rows[0];
    if (!["ready", "partial"].includes(row.state)) {
      await c.query("COMMIT");
      return publicSubmission(row);
    }
    await c.query(
      "UPDATE service_order_submissions SET state='sending',updated_at=now(),message=NULL WHERE id=$1",
      [key],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  let result: any;
  let state: string,
    message: string | null = null,
    m8Id = row.m8_id,
    next = row.next_item;
  try {
    const item = row.items[next];
    result = await m8(
      "/v1/assistenciatecnica/ordemservico" +
        (m8Id
          ? `/${m8Id}/${
              item.kind === "flow-status"
                ? "statusfluxo"
                : item.kind === "equipment"
                  ? "equipamento"
                  : item.kind === "material"
                    ? "produto"
                    : "servico"
            }`
          : ""),
      m8Id ? item.payload : row.header,
      m8Id && item.kind === "flow-status" ? "PATCH" : "POST",
    );
    if (
      !(m8Id && item.kind === "flow-status") &&
      (!Number.isInteger(result?.id) || result.id <= 0)
    )
      throw new M8RequestError(
        "O M8 não retornou o ID criado. Confira no ERP antes de reenviar.",
        true,
      );
    if (m8Id) next++;
    else m8Id = result.id;
    state = next === row.items.length ? "complete" : "ready";
  } catch (e) {
    state =
      e instanceof M8RequestError && !e.uncertain
        ? m8Id
          ? "partial"
          : "rejected"
        : "uncertain";
    message =
      e instanceof M8RequestError
        ? e.message
        : "Não foi possível confirmar a gravação. Confira no ERP antes de reenviar.";
  }
  const save = await db.connect();
  try {
    await save.query("BEGIN READ WRITE");
    const r = await save.query(
      "UPDATE service_order_submissions SET state=$2,m8_id=$3,next_item=$4,message=$5,updated_at=now() WHERE id=$1 RETURNING *",
      [key, state, m8Id, next, message],
    );
    await save.query("COMMIT");
    return publicSubmission(r.rows[0]);
  } catch (e) {
    await save.query("ROLLBACK");
    throw e;
  } finally {
    save.release();
  }
}
