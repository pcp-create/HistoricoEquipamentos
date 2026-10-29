import type { BillingCheck } from "./billing";
import flowOwners from "./flow-owners.json";
export const companies = [
  { id: 1, name: "RJ Indústria" },
  { id: 2, name: "RJ Serrana" },
  { id: 27404, name: "Criciúma Compressores" },
];
export type SourceRow = {
  company_id: number;
  id: string;
  kind?: string;
  payload: Record<string, any>;
};
export type Detail = {
  company: number;
  kind: string;
  id: string;
  name: string;
  date: string;
  amount: number;
  overdue?: boolean;
  sourceKind?: string;
  billing?: BillingCheck;
  programming?: { id?: string; status: string; label: string };
  workshop?: { visit: string; name: string; stage: string; label: string; color: string };
  linkedOrder?: { company: number; id: string; number: string; orderType: string; flowStatus: string };
  fields?: Record<string, string | number>;
};
export type Summary = {
  company: number;
  name: string;
  contracts: number;
  contractBilled: number;
  salesBilled: number;
  salesPending: number;
  other: number;
  returns: number;
  billed: number;
  pending: number;
  projection: number;
  contractPending: number;
};
export const rounded = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
const monthIndex = (s: string) =>
  Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
const amount = (v: unknown) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) throw Error("Valor de origem inválido");
  return n;
};
const contractKey = (person: unknown, value: number) =>
  `${person}:${value.toFixed(4)}`;
export function projection(
  facts: SourceRow[],
  orders: SourceRow[],
  period: string,
  today: string,
) {
  const details: Detail[] = [];
  const billedByKey = new Map<string, number>();
  const contractDetailKeys = new Map<Detail, string>();
  const rows: Summary[] = companies.map((c) => ({
    company: c.id,
    name: c.name,
    contracts: 0,
    contractBilled: 0,
    salesBilled: 0,
    salesPending: 0,
    other: 0,
    returns: 0,
    billed: 0,
    pending: 0,
    projection: 0,
    contractPending: 0,
  }));
  const byCompany = new Map(rows.map((r) => [r.company, r]));
  const keys = new Map<number, Set<string>>(
    companies.map((c) => [c.id, new Set()]),
  );
  for (const f of facts.filter((f) => f.kind === "fContratos")) {
    const p = f.payload,
      c = Number(p.estabelecimentoId || f.company_id),
      r = byCompany.get(c);
    if (!r || !p.inicio || !p.final) continue;
    const start = monthIndex(p.inicio),
      end = monthIndex(p.final),
      selected = monthIndex(period);
    if (selected < start || selected > end || end < start) continue;
    const value = amount(p.valor) / (end - start + 1);
    r.contracts += value;
    keys.get(c)!.add(contractKey(p.pessoaId, value));
    const contractDetail: Detail = {
      company: c,
      kind: "contracts",
      id: f.id,
      name: p.pessoaNome || p.descricao || "Contrato",
      date: period + "-01",
      amount: value,
      fields: {
        contractType: String(p.tipoContratoNome || ""),
        installment: `${selected - start + 1}/${end - start + 1}`,
        start: String(p.inicio).slice(0, 10),
        end: String(p.final).slice(0, 10),
        billed: 0,
        pending: value,
      },
    };
    details.push(contractDetail);
    contractDetailKeys.set(
      contractDetail,
      `${c}:${contractKey(p.pessoaId, value)}`,
    );
  }
  const invoices = new Set<string>();
  for (const f of [...facts].sort((a, b) => a.company_id - b.company_id)) {
    const p = f.payload,
      r = byCompany.get(Number(p.empresaId || f.company_id));
    if (
      !r ||
      p.status !== "Processado" ||
      String(p.emissao).slice(0, 7) !== period
    )
      continue;
    const value = amount(p.totalGeral);
    if (f.kind === "fFaturamento") {
      if (invoices.has(f.id)) continue;
      invoices.add(f.id);
      r.billed += value;
      const isContract = keys
        .get(r.company)!
        .has(contractKey(p.pessoaId, value));
      if (isContract) {
        r.contractBilled += value;
        const key = `${r.company}:${contractKey(p.pessoaId, value)}`;
        billedByKey.set(key, (billedByKey.get(key) || 0) + value);
      }
      details.push({
        company: r.company,
        kind: isContract ? "contractBilled" : "invoices",
        id: f.id,
        name: p.pessoaNome || p.pessoaRazaoSocial || "Nota fiscal",
        date: String(p.emissao).slice(0, 10),
        amount: value,
      });
    } else if (
      (f.kind === "fDevolucoesCompra" &&
        String(p.tipoCompraDescricao).includes("DEVOL")) ||
      (f.kind === "fDevolucoesOutros" &&
        [30, 82, 90, 213].includes(Number(p.outrosDocumentosOperacaoId)))
    ) {
      r.returns += value;
      details.push({
        company: r.company,
        kind: "returns",
        sourceKind: f.kind,
        id: f.id,
        name: p.pessoaNome || p.fornecedorRazaoSocial || "Devolução",
        date: String(p.emissao).slice(0, 10),
        amount: value,
      });
    }
  }
  for (const o of orders) {
    const p = o.payload,
      r = byCompany.get(Number(p.empresaId || o.company_id));
    if (
      !r ||
      !String(p.situacaoNome || "")
        .toUpperCase()
        .includes("COBRANÇA")
    )
      continue;
    const date = String(
      p.status === "Processado"
        ? p.dataFaturamento || ""
        : p.dataEntregaPrevista || "",
    ).slice(0, 10);
    const adjusted =
      date && date.slice(0, 7) < today.slice(0, 7)
        ? today.slice(0, 7) + "-01"
        : date;
    const selected = p.status === "Pendente" ? adjusted : date;
    if (
      !selected ||
      selected.slice(0, 7) !== period ||
      !["Pendente", "Processado"].includes(p.status)
    )
      continue;
    const value = amount(p.totalGeral),
      kind = p.status === "Pendente" ? "salesPending" : "salesBilled";
    r[kind] += value;
    details.push({
      company: r.company,
      kind,
      id: o.id,
      name: p.clienteNome || p.clienteRazaoSocial || "Ordem de serviço",
      date,
      amount: value,
      overdue: p.status === "Pendente" && date !== adjusted,
      fields: {
        status: p.status,
        orderType: String(p.tipoNome || ""),
        flowStatus: String(p.statusLancamentoNome || ""),
        expected: String(p.dataEntregaPrevista || "").slice(0, 10),
        modality:
          Number(p.modalidadeAtendimentoId) === 5
            ? "Interno (Oficina)"
            : Number(p.modalidadeAtendimentoId) === 4
              ? "Externo"
              : "Ajustar",
        flowOwner:
          (flowOwners as Record<string, string>)[
            String(p.statusLancamentoNome || "").trim()
          ] || "Outro",
        notes: String(p.observacao || ""),
        equipment: String(p.equipamento || ""),
        opened: String(p.dataAbertura || "").slice(0, 10),
        billedDate: String(p.dataFaturamento || "").slice(0, 10),
        seller: String(p.funcionarioNome || ""),
        customerId: String(p.clienteId || ""),
        sourceCompany: o.company_id,
      },
    });
  }
  for (const [detail, key] of contractDetailKeys) {
    detail.fields!.billed = rounded(Math.max(0, billedByKey.get(key) || 0));
    detail.fields!.pending = rounded(
      detail.amount - Number(detail.fields!.billed),
    );
  }
  for (const r of rows) {
    r.contractBilled = Math.max(0, r.contractBilled);
    r.other = r.billed - r.salesBilled - r.contractBilled;
    r.billed -= r.returns;
    r.contractPending = r.contracts - r.contractBilled;
    r.pending = r.contractPending + r.salesPending;
    r.projection = r.billed + r.pending;
    for (const k of Object.keys(r))
      if (k !== "company" && typeof r[k as keyof Summary] === "number")
        (r as any)[k] = rounded((r as any)[k]);
  }
  return { rows, details };
}
export function sumRows(rows: Summary[]): Summary {
  const total = { ...rows[0], company: 0, name: "Total do grupo" } as Summary;
  for (const key of Object.keys(total))
    if (key !== "company" && key !== "name")
      (total as any)[key] = rounded(
        rows.reduce((s, r) => s + Number((r as any)[key]), 0),
      );
  return total;
}
