export const normalize = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
export const serialKey = (v: unknown) => normalize(v).replace(/[^A-Z0-9]/g, "");
export function usableSerial(v: unknown) {
  const key = serialKey(v);
  return (
    key.length >= 4 &&
    key.length <= 40 &&
    /\d/.test(key) &&
    !/^(0+|1+|9+)$/.test(key) &&
    !/^(?:GA|GX|G)\d{1,3}(?:VSD)?$/.test(key)
  );
}
export function identity(row: Record<string, unknown>) {
  const text = normalize([row.nome, row.apelido].filter(Boolean).join(" "));
  const models = [
    ...new Set(
      (
        text.match(/\b(?:GA|GX|G)\s*\d{1,3}C?\s*\+?(?:\s*VSD\s*\+?)?/g) || []
      ).map((v) => v.replace(/\s/g, "")),
    ),
  ];
  const series: string[] = [];
  for (const m of text.matchAll(
    /\b(?:SERIE|SERIAL|S\/N)\s*(?:N[º°]\s*)?[:#=–-]?\s*((?:[A-Z]{1,6}\s+)?[A-Z0-9]+(?:[.-][A-Z0-9]+)*)/g,
  )) {
    if (usableSerial(m[1])) series.push(serialKey(m[1]));
  }
  const extracted = [...new Set(series)];
  const structured = usableSerial(row.numeroSerie)
    ? serialKey(row.numeroSerie)
    : null;
  return {
    serial: structured || (extracted.length === 1 ? extracted[0]! : null),
    serial_source: structured
      ? "campo"
      : extracted.length === 1
        ? "nome"
        : null,
    model: models.length === 1 ? models[0]! : null,
    models,
    issues: [
      ...(extracted.length > 1 ? ["Mais de uma série no nome"] : []),
      ...(models.length > 1 ? ["Mais de um modelo no nome"] : []),
    ],
  };
}
export interface EquipmentIdentity {
  equipment_id: string;
  name: string;
  model: string | null;
  serial: string | null;
  serial_source: string | null;
  people: string[];
}
export interface OrderIdentity {
  order_id: string;
  client_id: string | null;
  explicit_ids: string[];
  serials: string[];
  model: string | null;
  texts: { field: string; text: string }[];
}
export interface EquipmentLink {
  order_id: string;
  equipment_id: string;
  method: "explicit" | "serial" | "observation" | "review";
  evidence: { field: string; value: string; reason: string };
}
export function relate(
  order: OrderIdentity,
  all: EquipmentIdentity[],
): EquipmentLink[] {
  const results = new Map<string, EquipmentLink>();
  const add = (
    e: EquipmentIdentity,
    method: EquipmentLink["method"],
    field: string,
    value: string,
    reason: string,
  ) => {
    const rank = { explicit: 0, serial: 1, observation: 2, review: 3 },
      previous = results.get(e.equipment_id);
    if (!previous || rank[method] < rank[previous.method])
      results.set(e.equipment_id, {
        order_id: order.order_id,
        equipment_id: e.equipment_id,
        method,
        evidence: { field, value, reason },
      });
  };
  const owned = all.filter(
    (e) => order.client_id && e.people.includes(order.client_id),
  );
  const explicit = all.filter((e) =>
    order.explicit_ids.includes(e.equipment_id),
  );
  for (const e of explicit)
    add(
      e,
      "explicit",
      "produtoEquipamentoId/equipamentoProdutoId",
      e.equipment_id,
      "ID estruturado do equipamento no ERP",
    );
  const structured = [
    ...new Set(order.serials.filter(usableSerial).map(serialKey)),
  ];
  for (const serial of structured) {
    const matches = owned.filter((e) => e.serial === serial);
    for (const e of matches)
      add(
        e,
        matches.length === 1 ? "serial" : "review",
        "numeroSerie/serie",
        serial,
        matches.length === 1
          ? "Série completa e cadastro do cliente"
          : "Série repetida no cadastro do cliente",
      );
  }
  for (const e of owned) {
    if (!e.serial || e.serial.length < 6) continue;
    const token = e.serial.split("").join("[ .-]*");
    const regex = new RegExp("(?<![A-Z0-9])" + token + "(?![A-Z0-9])", "g");
    for (const field of order.texts) {
      const text = normalize(field.text);
      for (const match of text.matchAll(regex)) {
        const before = text.slice(Math.max(0, match.index - 65), match.index);
        // Numeric IDs require an adjacent serial label; an OS number or invoice is not a machine identity.
        if (
          /^\d+$/.test(e.serial) &&
          !/(?:SERIE|SERIAL|S\/N)\s*[:#=–-]?\s*$/.test(before)
        )
          continue;
        const duplicate =
          owned.filter((x) => x.serial === e.serial).length !== 1;
        const conflict =
          explicit.some((x) => x.equipment_id !== e.equipment_id) ||
          structured.some((x) => x !== e.serial);
        const uncertain =
          /\b(?:NAO|ANTIG[AO]|SUBSTITUID[AO]|INCORRET[AO])\b/.test(before);
        const review = duplicate || conflict || uncertain;
        add(
          e,
          review ? "review" : "observation",
          field.field,
          e.serial,
          review
            ? "Menção ambígua, conflitante ou série repetida; conferir"
            : "Série completa no texto e equipamento vinculado ao cliente",
        );
      }
    }
  }
  // Model alone is only a candidate, even when the client has a single machine.
  const text = normalize(
    [order.model, ...order.texts.map((x) => x.text)].join(" "),
  );
  for (const e of owned)
    if (e.model && !results.has(e.equipment_id)) {
      const pattern = e.model
        .split("")
        .map((c) => c.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&"))
        .join("\\s*");
      if (new RegExp("(?<![A-Z0-9])" + pattern + "(?![A-Z0-9+])").test(text))
        add(
          e,
          "review",
          "modelo/observações",
          e.model,
          "Modelo encontrado sem confirmação de série",
        );
    }
  return [...results.values()];
}
