import type { SourceRow } from "./model";

export type BillingDocument = {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: string;
  link: "M8" | "Referência à OS";
};
export type BillingCheck = {
  state: "partial" | "matched" | "unmatched" | "review";
  billed: number;
  balance: number | null;
  documents: BillingDocument[];
  reason: string;
};
const cents = (v: unknown) => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? Math.round(n * 100) : null;
};
const key = (company: unknown, id: unknown) => `${company}:${id}`;
export const orderBillingKey = (o: SourceRow) =>
  key(o.payload.empresaId || o.company_id, o.id);

// Invoice headers expose no structured service-order FK. Explicit references are
// evidence, not a financial allocation: never split an invoice across several OS.
export function orderReferences(value: unknown) {
  const text = String(value || "").toUpperCase();
  const ids = [
    ...text.matchAll(/\bO\.?\s*S\.?\s*(?:N[º°O.]?\s*)?[:#\-]?\s*(\d+)\b/g),
  ].map((m) => String(Number(m[1])));
  const list =
    /\bO\.?\s*S\.?\s*(?:N[º°O.]?\s*)?[:#\-]?\s*\d+\s*(?:[,/;&+]|\bE\b)\s*\d+/.test(
      text,
    );
  return { ids: [...new Set(ids)], list };
}

export type BillingLink = {
  company_id: number;
  ordem_servico_id: string;
  documento_fiscal_id: string;
};

export function reconcileBilling(orders: SourceRow[], invoices: SourceRow[], links: BillingLink[] = []) {
  const documentsByOrder = new Map<string, Set<string>>();
  for (const link of links) {
    const source = key(link.company_id, link.ordem_servico_id);
    if (!documentsByOrder.has(source)) documentsByOrder.set(source, new Set());
    documentsByOrder.get(source)!.add(link.documento_fiscal_id);
  }
  const byAlias = new Map<string, Set<string>>(),
    byDocument = new Map<string, Set<string>>();
  const checks = new Map<string, BillingCheck>(),
    orderByKey = new Map<string, SourceRow>();
  const add = (map: Map<string, Set<string>>, index: string, id: string) => {
    if (!map.has(index)) map.set(index, new Set());
    map.get(index)!.add(id);
  };
  for (const o of orders) {
    const p = o.payload,
      c = p.empresaId || o.company_id,
      id = orderBillingKey(o);
    orderByKey.set(id, o);
    checks.set(id, {
      state: "unmatched",
      billed: 0,
      balance: null,
      documents: [],
      reason:
        "Nenhuma nota válida com vínculo identificável. Não significa ausência de faturamento.",
    });
    if (!p.clienteId) continue;
    for (const alias of new Set([o.id, String(p.numeroSequencia || "")])) {
      if (/^[1-9]\d*$/.test(alias))
        add(byAlias, `${c}:${p.clienteId}:${alias}`, id);
    }
    // Collection context identifies the source OS; invoice company/customer
    // still scope the financial association, including duplicated M8 contexts.
    for (const document of documentsByOrder.get(key(o.company_id, o.id)) || [])
      add(byDocument, `${c}:${p.clienteId}:${document}`, id);
    if (Number(p.tipoDocumentoFiscal) === 2 && p.documentoFiscalId)
      add(byDocument, `${c}:${p.clienteId}:${p.documentoFiscalId}`, id);
  }
  const ambiguous = new Set<string>(),
    seen = new Set<string>();
  for (const f of [...invoices].sort((a, b) => a.company_id - b.company_id)) {
    const p = f.payload,
      c = p.empresaId || f.company_id,
      invoiceKey = key(c, f.id);
    if (f.kind !== "fFaturamento" || seen.has(invoiceKey)) continue;
    seen.add(invoiceKey);
    const refs = orderReferences(p.observacao),
      direct =
        byDocument.get(`${c}:${p.pessoaId}:${f.id}`) || new Set<string>();
    const candidates = new Set(direct);
    let unknownReference = false;
    for (const ref of refs.ids) {
      const matches = byAlias.get(`${c}:${p.pessoaId}:${ref}`);
      if (!matches?.size) unknownReference = true;
      for (const id of matches || []) candidates.add(id);
    }
    if (
      candidates.size !== 1 ||
      refs.ids.length > 1 ||
      refs.list ||
      unknownReference
    ) {
      for (const id of candidates) ambiguous.add(id);
      continue;
    }
    const id = [...candidates][0],
      check = checks.get(id)!;
    const value = cents(p.totalGeral);
    if (value == null || value < 0) {
      ambiguous.add(id);
      continue;
    }
    const status = p.estaExcluido
      ? "Excluído"
      : String(p.status || "Não informado");
    check.documents.push({
      id: f.id,
      number: String(p.documento || p.documentoNfe || f.id),
      date: String(p.emissao || "").slice(0, 10),
      amount: value / 100,
      status,
      link: direct.has(id) ? "M8" : "Referência à OS",
    });
    if (status === "Processado")
      check.billed = Math.round(check.billed * 100 + value) / 100;
  }
  for (const [id, check] of checks) {
    check.documents.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    const total = cents(orderByKey.get(id)!.payload.totalGeral),
      billed = cents(check.billed)!;
    if (ambiguous.has(id) || total == null || total <= 0) {
      check.state = "review";
      check.reason =
        "Vínculo ambíguo ou valores inconsistentes. Confira as notas antes de calcular o saldo.";
      continue;
    }
    if (billed <= 0) continue;
    const difference = total - billed;
    if (difference > 1) {
      check.state = "partial";
      check.balance = difference / 100;
      check.reason =
        "Parte do valor da OS não foi localizada em notas válidas. Confira complementos, cancelamentos e eventual refaturamento em outra OS.";
    } else if (difference < -1) {
      check.state = "review";
      check.reason =
        "Notas vinculadas excedem o total da OS. Confira impostos, descontos, referências e refaturamentos.";
    } else {
      check.state = "matched";
      check.balance = 0;
      check.reason =
        "O total das notas válidas identificadas corresponde ao valor da OS.";
    }
  }
  return checks;
}
export const billingLabels: Record<BillingCheck["state"], string> = {
  partial: "Possível parcial",
  matched: "Valor conciliado",
  unmatched: "Sem vínculo identificado",
  review: "Conferir vínculo",
};
