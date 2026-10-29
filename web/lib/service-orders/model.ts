import { extraFields } from "./extra-fields";
export class OrderInputError extends Error {}
export function positiveId(v: unknown, label: string) {
  const n = Number(v);
  if (!/^[1-9]\d*$/.test(String(v)) || !Number.isInteger(n) || n > 2147483647)
    throw new OrderInputError(`Selecione ${label}.`);
  return n;
}
export type OrderItem = {
  kind: "material" | "service";
  id?: string;
  code: string;
  name: string;
  quantity: string;
  price: string;
  notes?: string;
  internalNotes?: string;
};
export type OrderDraft = {
  deliveryChangeReason?: string;
  company: string;
  type: string;
  customer: string;
  equipment: string;
  serviceType: string;
  origin: string;
  seller: string;
  technician: string;
  payment: string;
  expected: string;
  delivery: string;
  situation: string;
  flowStatus: string;
  freight: string;
  notes: string;
  internalNotes: string;
  items: OrderItem[];
  extra?: Record<string, string>;
};
export function parseOrder(value: unknown, editing = false): OrderDraft {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OrderInputError("Dados inválidos.");
  const b = value as Record<string, unknown>,
    out: Record<string, any> = {};
  for (const [k, label] of Object.entries({
    company: "a empresa",
    type: "o tipo de OS",
    customer: "o cliente",
    equipment: "o equipamento",
    serviceType: "o tipo de atendimento",
    origin: "a origem do atendimento",
    seller: "o vendedor",
    payment: "a condição de pagamento",
    situation: "a situação",
    flowStatus: "o Status Fluxo",
  }))
    if (
      !b[k] &&
      (k === "origin" ||
        (editing && ["equipment", "serviceType", "situation", "flowStatus"].includes(k)))
    )
      out[k] = "";
    else out[k] = String(positiveId(b[k], label));
  if (editing && !b.freight) out.freight = "";
  else if (
    !/^(0|[1-9]\d*)$/.test(String(b.freight)) ||
    Number(b.freight) > 2147483647
  )
    throw new OrderInputError("Selecione o frete.");
  else out.freight = String(b.freight);
  if (!["1", "2", "27404"].includes(out.company))
    throw new OrderInputError("Empresa inválida.");
  if (
    b.technician != null &&
    b.technician !== "" &&
    (typeof b.technician !== "string" ||
      (!b.technician.includes("@") &&
        !(editing && /^m8:[1-9]\d*$/.test(b.technician))) ||
      b.technician.length > 254)
  )
    throw new OrderInputError("Selecione o técnico.");
  out.technician = b.technician ?? "";
  for (const k of ["expected", "delivery"]) {
    const d = b[k];
    if (
      typeof d !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(d)) ||
      new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d
    )
      throw new OrderInputError("Informe datas de entrega válidas.");
    out[k] = d;
  }
  for (const k of ["notes", "internalNotes"]) {
    const value = k === "internalNotes" && b[k] == null ? "" : b[k];
    if (
      typeof value !== "string" ||
      (!editing && k === "notes" && !value.trim()) ||
      value.length > 20000
    )
      throw new OrderInputError(
        k === "notes" ? "Preencha as observações (até 20.000 caracteres)." : "Use até 20.000 caracteres nas observações internas.",
      );
    out[k] = (value as string).trim();
  }
  if (!Array.isArray(b.items) || b.items.length > 200)
    throw new OrderInputError("Use até 200 produtos e serviços.");
  out.items = b.items.map((i: any) => {
    if (
      !i ||
      !["material", "service"].includes(i.kind) ||
      typeof i.name !== "string" ||
      i.name.length > 500
    )
      throw new OrderInputError("Item inválido.");
    positiveId(i.code, "um produto ou serviço válido");
    if (
      !/^\d{1,7}(\.\d{1,3})?$/.test(String(i.quantity)) ||
      Number(i.quantity) <= 0 ||
      !/^\d{1,8}(\.\d{1,2})?$/.test(String(i.price)) ||
      Number(i.quantity) * Number(i.price) > 100000000
    )
      throw new OrderInputError(
        "Informe quantidade positiva e preço válido nos itens.",
      );
    for (const key of ["notes", "internalNotes"]) {
      if (i[key] !== undefined && (typeof i[key] !== "string" || i[key].length > 20000))
        throw new OrderInputError("Observações do serviço devem ter até 20.000 caracteres.");
    }
    if (editing && i.id) positiveId(i.id, "o item da OS");
    return {
      ...(editing && i.id ? { id: String(i.id) } : {}),
      kind: i.kind,
      code: String(i.code),
      name: i.name,
      quantity: String(i.quantity),
      price: String(i.price),
      ...(i.kind === "service" ? {
        ...(i.notes !== undefined ? { notes: i.notes.trim() } : {}),
        ...(i.internalNotes !== undefined ? { internalNotes: i.internalNotes.trim() } : {}),
      } : {}),
    };
  });
  if (
    new Set(
      out.items.map(
        (i: OrderItem) =>
          i.kind + ":" + (editing && i.id ? "id-" + i.id : i.code),
      ),
    ).size !== out.items.length
  )
    throw new OrderInputError(
      "Produto ou serviço duplicado. Ajuste a quantidade na linha existente.",
    );
  if (b.extra !== undefined) {
    if (!b.extra || typeof b.extra !== "object" || Array.isArray(b.extra))
      throw new OrderInputError("Informações adicionais inválidas.");
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(b.extra)) {
      const field = extraFields.find((f) => f.key === key);
      if (!field || typeof value !== "string" || value.length > 2000)
        throw new OrderInputError("Campo adicional inválido.");
      const v = value.trim();
      if (!v) continue;
      if (
        field.type === "number" &&
        (!/^(0|[1-9]\d*)$/.test(v) || Number(v) > 2147483647)
      )
        throw new OrderInputError(`Informe ${field.label} válido.`);
      if (field.type === "select" && !field.options?.includes(v))
        throw new OrderInputError(`Selecione ${field.label} válido.`);
      if (
        field.type === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          !Number.isFinite(Date.parse(v)) ||
          new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v)
      )
        throw new OrderInputError(`Informe ${field.label} válida.`);
      extra[key] = v;
    }
    out.extra = extra;
  }
  return out as OrderDraft;
}
export function itemPayload(i: OrderItem, technician?: number) {
  const quantity = Number(i.quantity),
    price = Number(i.price);
  return {
    [i.kind === "material" ? "produtoId" : "servicoId"]: Number(i.code),
    ...(i.kind === "service" ? {
      ...(i.notes !== undefined ? { observacao: i.notes } : {}),
      ...(i.internalNotes !== undefined ? { observacaoInterna: i.internalNotes } : {}),
    } : {}),
    quantidade: quantity,
    valorUnitario: price,
    valorTotal:
      Math.round(
        (Math.round(quantity * 1000) * Math.round(price * 100)) / 1000,
      ) / 100,
    ...(i.kind === "service" && technician
      ? { responsavelTecnicoId: technician }
      : {}),
  };
}
export function brazilNow(date = new Date()) {
  return (
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .format(date)
      .replace(" ", "T") + "-03:00"
  );
}

export function extraPayload(extra: Record<string, string> = {}) {
  return Object.fromEntries(
    Object.entries(extra).map(([key, value]) => {
      const field = extraFields.find((f) => f.key === key)!;
      return [
        key,
        field.type === "number"
          ? Number(value)
          : field.type === "date"
            ? value + "T00:00:00-03:00"
            : value,
      ];
    }),
  );
}
