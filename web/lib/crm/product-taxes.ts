import "server-only";
import { m8Session } from "../service-orders/m8";
import type { OrderDraft } from "../service-orders/model";
import { CrmError, positive } from "./model";
import { discountedUnitCents } from "./financials";
import { taxKey, type ProductTaxes } from "./product-terms";
export async function taxBudgetTypes(company: string) {
  const request = await m8Session(positive(company));
  const rows = await request("/v1/crm/tipoorcamento?Ativo=true&PageSize=1000");
  if (!Array.isArray(rows))
    throw new CrmError(
      "Resposta inválida dos tipos de orçamento fiscal do M8.",
    );
  return rows
    .filter((r) => r.ativo)
    .map((r) => ({ id: String(r.id), name: r.descricao }));
}
export async function hydrateProductTaxes(
  draft: OrderDraft,
  session = m8Session,
): Promise<OrderDraft> {
  const products = draft.items;
  if (!products.length || !draft.commercial?.taxBudgetType) return draft;
  try {
    const request = await session(positive(draft.company)),
      taxes = new Map<string, ProductTaxes>();
    // The response identifies only the product, not the line. Separate repeated codes to avoid mixing prices.
    const batches: (typeof products)[] = [];
    for (const item of products) {
      const simulationCode=item.kind==='service'?'11869':item.code;
      let batch = batches.find((b) => !b.some((i) => (i.kind==='service'?'11869':i.code) === simulationCode));
      if (!batch) {
        batch = [];
        batches.push(batch);
      }
      batch.push(item);
    }
    for (const batch of batches) {
      const rows = await request("/v1/crm/impostosimular", {
        clienteId: positive(draft.customer),
        tipoOrcamentoId: positive(draft.commercial.taxBudgetType),
        itens: batch.map((i) => ({
          produtoId: positive(i.kind==='service'?'11869':i.code),
          quantidade: Number(i.quantity),
          valorUnitario: discountedUnitCents(i) / 100,
        })),
      });
      if (!Array.isArray(rows)) throw Error("Resposta inválida.");
      for (const item of batch) {
        const matches = rows.filter((r) => String(r.produtoId) === (item.kind==='service'?'11869':item.code));
        if (matches.length !== 1) throw Error("Produto sem resultado fiscal.");
        const source = matches[0].impostos,
          values: Record<string, number> = {};
        const fields=item.kind==='service'?{pis:'valorPis',cofins:'valorCofins'}:{icms:'valorIcms',icmsSt:'valorIcmsSt',pis:'valorPis',cofins:'valorCofins',ipi:'valorIpi'};
        for (const [key, field] of Object.entries(fields)) {
          const value = source?.[field];
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
            throw Error("Valor fiscal inválido.");
          values[key] = Math.round(value * 100);
        }
        taxes.set(taxKey(draft, item), {
          ...values,
          ...(item.kind==='service'?{icms:null,icmsSt:null,ipi:null}:{}),
          key: taxKey(draft, item),
          at: new Date().toISOString(),
        } as ProductTaxes);
      }
    }
    return {
      ...draft,
      items: draft.items.map((i) => ({ ...i, taxes: taxes.get(taxKey(draft, i)) })),
    };
  } catch {
    throw new CrmError(
      "Não foi possível simular os impostos no M8. Confira o tipo de orçamento fiscal e tente novamente. Nenhum imposto foi considerado zero.",
    );
  }
}

/** PDFs must never silently omit taxes because fiscal setup is incomplete. */
export async function hydratePdfProductTaxes(draft: OrderDraft, session = m8Session): Promise<OrderDraft> {
  if(draft.items.length&&!draft.commercial?.taxBudgetType)
    throw new CrmError('Configure o tipo de orçamento fiscal no cadastro do tipo de proposta antes de gerar o PDF com impostos.');
  return hydrateProductTaxes(draft,session);
}
