import "server-only";
import { refreshProjectionOrder } from "../sales-projection/refresh-order";
import { createHash } from "node:crypto";
import { database } from "../db";
import { m8Session, M8RequestError } from "./m8";
import {
  parseOrder,
  positiveId,
  OrderInputError,
  itemPayload,
  type OrderDraft,
} from "./model";
import { extraFields } from "./extra-fields";
import { processedOrder } from "./edit-status";
import contract from "./edit-contract.json";
const text = (v: any) => (v == null ? "" : String(v));
const day = (v: any) => text(v).slice(0, 10);
function canonical(v: any): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
}
export const fingerprint = (v: any) =>
  createHash("sha256").update(canonical(v)).digest("hex");
function target(company: any, id: any) {
  if (!["1", "2", "27404"].includes(String(company)))
    throw new OrderInputError("Empresa inválida.");
  positiveId(id, "a OS");
}
function uuid(id: any) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new OrderInputError("Identificador inválido.");
}
export async function readEditSource(
  company: string,
  id: string,
  session = m8Session,
) {
  target(company, id);
  const m8 = await session(Number(company));
  const data = await m8(
    `/v1/assistenciatecnica/ordemservicocompleta?Id=${id}&Page=1&PageSize=1`,
  );
  if (!Array.isArray(data) || data.length !== 1 || String(data[0]?.id) !== id)
    throw new OrderInputError("OS não encontrada no M8.");
  if (processedOrder(data[0].status))
    throw new OrderInputError(
      "Ordens de serviço processadas não podem ser editadas.",
    );
  if (!["Pendente", "Aprovado", "Cancelado"].includes(data[0].status))
    throw new OrderInputError("Não foi possível confirmar o status da OS.");
  return data[0];
}
export function writable(source: any, name: string): any {
  const schema = (contract as any)[name];
  const out: any = {};
  if (!source || typeof source !== "object") return out;
  for (const [key, p] of Object.entries<any>(schema.properties || {})) {
    const v = source[key];
    if (v === undefined || p.readOnly) continue;
    if (v === null) {
      if (p.nullable) out[key] = null;
      continue;
    }
    if (p.$ref && (contract as any)[p.$ref.split("/").at(-1)]?.properties)
      out[key] = writable(v, p.$ref.split("/").at(-1));
    else if (p.type === "array" && p.items?.$ref)
      out[key] = Array.isArray(v)
        ? v.map((r) => writable(r, p.items.$ref.split("/").at(-1)))
        : [];
    else out[key] = v;
  }
  return out;
}
export function toEditDraft(
  source: any,
  company: string,
  users: any[] = [],
): OrderDraft {
  const s = (key: string) => text(source[key]);
  const items = (
    key: string,
    kind: "material" | "service",
    code: string,
    name: string,
  ) =>
    (source[key] || [])
      .filter((r: any) => !r.estaExcluido)
      .map((r: any) => ({
        id: text(r.id),
        kind,
        code: text(r[code]),
        name: text(r[name]),
        quantity: text(r.quantidade),
        price: text(r.valorUnitario),
        ...(kind === "service" ? { notes: text(r.observacao), internalNotes: text(r.observacaoInterna) } : {}),
      }));
  return {
    company,
    type: s("tipoId"),
    customer: s("clienteId"),
    equipment: text(
      source.equipamentoProduto?.equipamentoProdutoId ||
        source.produtoEquipamentoId,
    ),
    serviceType: s("tipoAtendimentoId"),
    origin: s("origemId"),
    seller: s("funcionarioId"),
    technician:
      users.find((u) => text(u.m8_employee_id) === s("responsavelTecnicoId"))
        ?.email ||
      (source.responsavelTecnicoId ? "m8:" + source.responsavelTecnicoId : ""),
    payment: s("condicaoPagamentoId"),
    expected: day(source.dataEntregaPrevista),
    delivery: day(source.dataEntrega),
    situation: s("situacaoId"),
    flowStatus: s("statusLancamentoId"),
    freight: s("freteId"),
    notes: s("observacao"),
    internalNotes: s("observacaoInterna"),
    items: [
      ...items("produtos", "material", "produtoId", "produtoNome"),
      ...items("servicos", "service", "servicoId", "servicoNome"),
    ],
    extra: Object.fromEntries(
      extraFields
        .filter((f) => source[f.key] != null)
        .map((f) => [f.key, f.type === "date" ? day(source[f.key]) : s(f.key)]),
    ),
  };
}
export async function loadEdit(company: string, id: string) {
  const source = await readEditSource(company, id);
  const users = (
    await database().query(
      "SELECT email,m8_employee_id FROM web_user_access WHERE enabled AND m8_employee_id IS NOT NULL",
    )
  ).rows;
  return {
    version: fingerprint(source),
    number: text(source.numeroSequencia || source.id),
    draft: toEditDraft(source, company, users),
    names: {
      customer: text(source.clienteNome),
      equipment: [
        source.equipamento,
        source.modeloEquipamento,
        source.numeroSerie,
      ]
        .filter(Boolean)
        .join(" - "),
    },
    technicianOption: source.responsavelTecnicoId
      ? {
          id: "m8:" + source.responsavelTecnicoId,
          displayId: text(source.responsavelTecnicoId),
          name: text(source.responsavelTecnicoNome) || "Técnico M8",
        }
      : null,
    labels: {
      type: source.tipoNome,
      seller: source.funcionarioNome,
      serviceType: source.tipoAtendimentoNome,
      payment: source.condicaoPagamentoNome,
      situation: source.situacaoNome,
      flowStatus: source.statusLancamentoNome,
    },
    opening: [source.dataAbertura, source.horaAbertura]
      .filter(Boolean)
      .join(" "),
    warranty: text(source.tipoGarantiaId),
    missing: [
      "origemId",
      "freteId",
      "observacaoInterna",
      "tipoGarantiaId",
    ].filter((k) => source[k] === undefined),
  };
}
async function transaction<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const c = await database().connect();
  try {
    await c.query("BEGIN READ WRITE");
    const v = await fn(c);
    await c.query("COMMIT");
    return v;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
function publicEdit(r: any) {
  return {
    id: r.id,
    company: r.company_id,
    m8Id: r.m8_id,
    state: r.state,
    nextItem: r.next_step,
    itemCount: r.steps.length,
    message: r.message,
    draft: r.request,
    localSynced: r.state === "complete" ? !r.message : undefined,
  };
}
export async function editStatus(email: string, id: string) {
  uuid(id);
  const r = (
    await database().query(
      "SELECT * FROM service_order_edits WHERE id=$1 AND created_by=$2",
      [id, email],
    )
  ).rows[0];
  if (!r) throw new OrderInputError("Edição não encontrada.");
  return publicEdit(r);
}
const primary: Record<string, string> = {
  type: "tipoId",
  customer: "clienteId",
  seller: "funcionarioId",
  payment: "condicaoPagamentoId",
  serviceType: "tipoAtendimentoId",
  origin: "origemId",
  situation: "situacaoId",
  freight: "freteId",
};
export async function prepareEdit(
  email: string,
  id: string,
  company: string,
  orderId: string,
  version: string,
  input: unknown,
  session = m8Session,
) {
  uuid(id);
  target(company, orderId);
  const existing = (
    await database().query("SELECT * FROM service_order_edits WHERE id=$1", [
      id,
    ])
  ).rows[0];
  if (existing) {
    if (
      existing.created_by !== email ||
      existing.company_id !== Number(company) ||
      text(existing.m8_id) !== orderId ||
      canonical(existing.request) !== canonical(input)
    )
      throw new OrderInputError("Este envio já contém outra edição.");
    return publicEdit(existing);
  }
  const source = await readEditSource(company, orderId, session);
  if (fingerprint(source) !== version)
    throw new OrderInputError(
      "A OS foi alterada no M8. Reabra a edição para carregar os dados atuais.",
    );
  const draft = parseOrder(input, true);
  if (draft.company !== company)
    throw new OrderInputError("Não é permitido alterar a empresa da OS.");
  if (processedOrder(draft.extra?.status))
    throw new OrderInputError(
      "O processamento da OS deve ser realizado no M8.",
    );
  const users = (
    await database().query(
      "SELECT email,m8_employee_id FROM web_user_access WHERE enabled AND m8_employee_id IS NOT NULL",
    )
  ).rows;
  const initial = toEditDraft(source, company, users);
  const regs = (
    await database().query(
      "SELECT * FROM service_order_registries WHERE active",
    )
  ).rows;
  const kinds: Record<string, string> = {
    serviceType: "service-types",
    origin: "service-origins",
    payment: "payment-terms",
    situation: "order-statuses",
    flowStatus: "flow-statuses",
    freight: "freight",
  };
  for (const [key, kind] of Object.entries(kinds)) {
    const value = text((draft as any)[key]);
    if (
      value &&
      value !== text((initial as any)[key]) &&
      !regs.some((r) => r.kind === kind && text(r.id) === value)
    )
      throw new OrderInputError("Selecione opções válidas nos cadastros.");
  }
  const header = writable(source, "ATOrdemServicoRequestDto");
  // Collections not managed by this screen must not be reinserted from read-only response DTOs.
  for (const k of [
    "apontamentos",
    "parcelas",
    "checklistRespostas",
    "manutencao",
  ])
    delete header[k];
  for (const [key, field] of Object.entries(primary)) {
    const v = text((draft as any)[key]);
    if (v !== text((initial as any)[key])) header[field] = v ? Number(v) : null;
  }
  if (
    draft.customer !== initial.customer &&
    !(
      await database().query(
        "SELECT 1 FROM m8_customer_directory WHERE company_id=1 AND person_id=$1",
        [draft.customer],
      )
    ).rows.length
  )
    throw new OrderInputError("Cliente inválido.");
  if (
    draft.type !== initial.type &&
    !(
      await database().query(
        "SELECT 1 FROM m8_order_type_catalog WHERE id=$1 AND active",
        [draft.type],
      )
    ).rows.length
  )
    throw new OrderInputError("Tipo de OS inválido.");
  if (draft.seller !== initial.seller || draft.customer !== initial.customer) {
    const m8 = await session(Number(company));
    const sellers = await m8(
      `/v1/configuracoes/cliente/${draft.customer}/vendedor?Page=0&PageSize=0`,
    );
    if (
      !Array.isArray(sellers) ||
      !sellers.some((r: any) => text(r.vendedorId) === draft.seller)
    )
      throw new OrderInputError("Vendedor inválido para o cliente.");
  }
  if (draft.technician !== initial.technician) {
    const tech = users.find((u) => u.email === draft.technician);
    if (draft.technician && !tech)
      throw new OrderInputError("Configure o ID do técnico no M8.");
    header.responsavelTecnicoId = tech?.m8_employee_id ?? null;
  }
  if (draft.serviceType !== initial.serviceType && draft.serviceType) {
    const reg = regs.find(
      (r) => r.kind === "service-types" && text(r.id) === draft.serviceType,
    );
    if (!reg?.warranty_id)
      throw new OrderInputError(
        "Configure o prazo de garantia no tipo de atendimento.",
      );
    header.tipoGarantiaId = reg.warranty_id;
  }
  if (
    draft.equipment !== initial.equipment ||
    draft.customer !== initial.customer ||
    draft.type !== initial.type
  ) {
    if (draft.equipment) {
      const e = (
        await database().query(
          "SELECT * FROM m8_equipment_catalog WHERE equipment_id=$1 AND present",
          [draft.equipment],
        )
      ).rows[0];
      const t = (
        await database().query(
          "SELECT customer_equipment_only FROM m8_order_type_catalog WHERE id=$1",
          [draft.type],
        )
      ).rows[0];
      if (!e || t?.customer_equipment_only == null)
        throw new OrderInputError(
          "Atualize os cadastros de equipamento e tipo de OS.",
        );
      if (
        t.customer_equipment_only &&
        !(
          await database().query(
            "SELECT 1 FROM m8_person_equipment WHERE company_id=1 AND person_id=$1 AND equipment_id=$2 AND present",
            [draft.customer, draft.equipment],
          )
        ).rows.length
      )
        throw new OrderInputError("O equipamento não pertence ao cliente.");
      header.equipamentoProduto = {
        ...header.equipamentoProduto,
        equipamentoProdutoId: Number(draft.equipment),
        equipamentoId: e.payload?.equipamentoId ?? null,
        numeroSerie: e.serial ?? null,
        equipamentoModelo: e.model ?? null,
      };
    } else throw new OrderInputError("Selecione o equipamento.");
  }
  for (const [key, field] of [
    ["expected", "dataEntregaPrevista"],
    ["delivery", "dataEntrega"],
  ] as const)
    if (draft[key] !== initial[key])
      header[field] = draft[key] + "T00:00:00-03:00";
  if (draft.notes !== initial.notes) header.observacao = draft.notes;
  if (draft.internalNotes !== initial.internalNotes)
    header.observacaoInterna = draft.internalNotes;
  for (const f of extraFields) {
    const value = draft.extra?.[f.key] || "";
    if (value === (initial.extra?.[f.key] || "")) continue;
    header[f.key] = !value
      ? null
      : f.type === "number"
        ? Number(value)
        : f.type === "date"
          ? value + "T00:00:00-03:00"
          : value;
  }
  const base = `/v1/assistenciatecnica/ordemservico/${orderId}`;
  const removals: any[] = [];
  for (const kind of ["material", "service"] as const) {
    const collection = kind === "material" ? "produtos" : "servicos",
      path = kind === "material" ? "produto" : "servico",
      code = kind === "material" ? "produtoId" : "servicoId";
    const originals = (source[collection] || []).filter(
      (r: any) => !r.estaExcluido,
    );
    const selected = draft.items.filter((i) => i.kind === kind);
    header[collection] = selected.map((i) => {
      const old = i.id ? originals.find((r: any) => text(r.id) === i.id) : null;
      if (i.id && (!old || text(old[code]) !== i.code))
        throw new OrderInputError("Item não pertence à OS.");
      const out = old
        ? writable(
            old,
            kind === "material"
              ? "ATOrdemServicoProdutoRequestDto"
              : "ATOrdemServicoServicoRequestDto",
          )
        : {};
      if (
        !old ||
        Number(old.quantidade) !== Number(i.quantity) ||
        Number(old.valorUnitario) !== Number(i.price)
      )
        Object.assign(out, itemPayload(i));
      if (kind === "service") {
        if (i.notes !== undefined) out.observacao = i.notes;
        if (i.internalNotes !== undefined) out.observacaoInterna = i.internalNotes;
      }
      return out;
    });
    for (const old of originals)
      if (!selected.some((i) => i.id === text(old.id)))
        removals.push({
          path: base + "/" + path + "/" + old.id,
          method: "DELETE",
          payload: {},
        });
  }
  for (const i of draft.items.filter((i) => !i.id)) {
    const table =
        i.kind === "material" ? "m8_product_catalog" : "m8_service_catalog",
      field = i.kind === "material" ? "product_id" : "service_id";
    if (
      !(
        await database().query(
          `SELECT 1 FROM ${table} WHERE ${field}=$1 LIMIT 1`,
          [i.code],
        )
      ).rows.length
    )
      throw new OrderInputError("Item não consta no catálogo.");
  }
  const steps = [{ path: base, method: "PUT", payload: header }, ...removals];
  if (draft.flowStatus !== initial.flowStatus && draft.flowStatus)
    steps.push({
      path: base + "/statusfluxo",
      method: "PATCH",
      payload: { statusFluxoId: Number(draft.flowStatus) },
    });
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock($1,$2)", [
      Number(company),
      Number(orderId),
    ]);
    if (
      (
        await c.query(
          "SELECT 1 FROM service_order_edits WHERE company_id=$1 AND m8_id=$2 AND state IN('ready','sending','partial','uncertain')",
          [company, orderId],
        )
      ).rows.length
    )
      throw new OrderInputError(
        "Esta OS possui uma edição em andamento. Confira o envio antes de editar novamente.",
      );
    const r = await c.query(
      "INSERT INTO service_order_edits(id,company_id,m8_id,created_by,source_hash,request,steps,state) VALUES($1,$2,$3,$4,$5,$6,$7,'ready') RETURNING *",
      [
        id,
        company,
        orderId,
        email,
        version,
        JSON.stringify(input),
        JSON.stringify(steps),
      ],
    );
    return publicEdit(r.rows[0]);
  });
}
export async function advanceEdit(
  email: string,
  id: string,
  session = m8Session,
) {
  uuid(id);
  const row = await transaction(async (c) => {
    const r = (
      await c.query(
        "SELECT * FROM service_order_edits WHERE id=$1 AND created_by=$2 FOR UPDATE",
        [id, email],
      )
    ).rows[0];
    if (!r) throw new OrderInputError("Edição não encontrada.");
    if (!["ready", "partial"].includes(r.state)) return { ...r, skip: true };
    await c.query(
      "UPDATE service_order_edits SET state='sending',updated_at=now() WHERE id=$1",
      [id],
    );
    return r;
  });
  if (row.skip) return publicEdit(row);
  let state = "uncertain",
    message = null,
    next = row.next_step,
    writeStarted = false;
  try {
    const m8 = await session(Number(row.company_id));
    const source = await readEditSource(
      text(row.company_id),
      text(row.m8_id),
      async () => m8,
    );
    if (next === 0 && fingerprint(source) !== row.source_hash)
      throw new OrderInputError("A OS mudou no M8. Reabra a edição.");
    const step = row.steps[next];
    // A PUT can already remove omitted children. Do not delete an item twice.
    const removedId = step.path.split("/").at(-1);
    const collection = step.path.includes("/produto/")
      ? "produtos"
      : "servicos";
    const alreadyRemoved =
      step.method === "DELETE" &&
      !(source[collection] || []).some(
        (r: any) => text(r.id) === removedId && !r.estaExcluido,
      );
    if (!alreadyRemoved) {
      writeStarted = true;
      const result = await m8(step.path, step.payload, step.method);
      if (step.method === "PUT" && text(result?.id) !== text(row.m8_id))
        throw new M8RequestError(
          "O M8 não confirmou o ID da OS editada. Confira no ERP antes de reenviar.",
          true,
        );
    }
    next++;
    state = next === row.steps.length ? "complete" : "ready";
  } catch (e) {
    state =
      !writeStarted || (e instanceof M8RequestError && !e.uncertain)
        ? next
          ? "partial"
          : "rejected"
        : "uncertain";
    message =
      e instanceof Error ? e.message : "Não foi possível confirmar a edição.";
  }
  if (state === "complete") {
    try { await refreshProjectionOrder(Number(row.company_id), text(row.m8_id), session); }
    catch { message = "OS salva no M8. A atualização local aguarda sincronização."; }
  }
  return transaction(async (c) =>
    publicEdit(
      (
        await c.query(
          "UPDATE service_order_edits SET state=$2,next_step=$3,message=$4,updated_at=now() WHERE id=$1 RETURNING *",
          [id, state, next, message],
        )
      ).rows[0],
    ),
  );
}
