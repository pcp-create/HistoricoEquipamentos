import type { Detail } from "./model";
export type Change = { key: string; type: "Entrada" | "Saída" | "Alteração"; before?: Detail; after?: Detail; changes: string[] };
const cents = (v: number) => Math.round(v * 100);
const identity = (d: Detail) => `${d.company}:${d.kind.startsWith("sales") ? "OS" : ["invoices", "contractBilled"].includes(d.kind) ? "invoice" : d.sourceKind || d.kind}:${d.id}`;
export function compareProjection(before: Detail[], after: Detail[]): Change[] {
  const old = new Map(before.map((d) => [identity(d), d]));
  const current = new Map(after.map((d) => [identity(d), d]));
  const result: Change[] = [];
  for (const key of new Set([...old.keys(), ...current.keys()])) {
    const a = old.get(key), b = current.get(key);
    if (!a || !b) {
      result.push({ key, type: a ? "Saída" : "Entrada", before: a, after: b, changes: [a ? "Não consta na projeção atual desta competência" : "Passou a constar nesta competência"] });
      continue;
    }
    const changes: string[] = [];
    if (cents(a.amount) !== cents(b.amount)) changes.push("Valor");
    if (a.kind !== b.kind) changes.push("Situação");
    if (a.date !== b.date) changes.push("Data de referência");
    if (a.name !== b.name) changes.push("Cliente");
    for (const [field, label] of [["expected", "Entrega prevista"], ["flowStatus", "Status do fluxo"], ["flowOwner", "Responsável do fluxo"], ["seller", "Vendedor"], ["billed", "Faturado do contrato"], ["pending", "Saldo do contrato"]] as const) {
      if (String(a.fields?.[field] ?? "") !== String(b.fields?.[field] ?? "")) changes.push(label);
    }
    if (changes.length) result.push({ key, type: "Alteração", before: a, after: b, changes });
  }
  return result;
}
