"use client";
import { Trash2 } from "lucide-react";
import {
  discountedUnitCents,
  itemFinancials,
  proposalFinancials,
} from "@/lib/crm/financials";
import type { OrderDraft } from "@/lib/service-orders/model";
import { crmMoney } from "./crm-api";
const cash = (v: number | null) => (v === null ? "Não informado" : crmMoney(v));
const percent = (v: number | null) =>
  v === null
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
export default function CrmProposalSummary({
  draft,
  names,
  onChange,
  disabled = false,
}: {
  draft: OrderDraft;
  onChange: (items: OrderDraft["items"]) => void;
  disabled?: boolean;
  names: { customer: string; equipment: string };
}) {
  const totals = proposalFinancials(draft.items);
  return (
    <section
      className="crm-proposal-summary"
      aria-label="Resumo geral da proposta"
    >
      <header>
        <h2>Resumo geral</h2>
        <p>
          {names.customer} {names.equipment && `· ${names.equipment}`}
        </p>
      </header>
      <div className="crm-financial-cards">
        {[
          ["Produtos", cash(totals.materials)],
          ["Serviços", cash(totals.services)],
          ["Total da proposta", cash(totals.sale)],
          ["Custo total", cash(totals.cost)],
          ["Lucro bruto estimado", cash(totals.profit)],
          ["Margem bruta", percent(totals.margin)],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      {!!totals.missing && (
        <p className="crm-info">
          Há {totals.missing} item(ns) sem custo disponível. Confira o custo
          médio e a unidade dos produtos ou informe o custo dos serviços para
          calcular o lucro e a margem totais. Custos em branco não são
          considerados como zero.
        </p>
      )}
      <p className="data-note">
        Lucro bruto estimado = venda − custo dos itens. Margem = lucro ÷ venda ×
        100. Os valores de venda já consideram os descontos. Impostos e despesas
        adicionais não estão incluídos neste cálculo.
      </p>
      {(["material", "service"] as const).map((kind) => (
        <section key={kind}>
          <h3>
            {kind === "material" ? "Produtos" : "Serviços"} (
            {draft.items.filter((i) => i.kind === kind).length})
          </h3>
          <div className="table-scroll">
            <table className="crm-summary-table">
              <thead>
                <tr>
                  <th>Código / descrição</th>
                  <th>Un.</th>
                  <th>Quantidade</th>
                  <th>Venda unitária</th>
                  <th>Desconto (%)</th>
                  <th>Venda total líquida</th>
                  <th>
                    {kind === "material"
                      ? "Custo médio unitário"
                      : "Custo unitário"}
                  </th>
                  <th>Custo total</th>
                  <th>Lucro bruto</th>
                  <th>Margem</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {draft.items
                  .filter((i) => i.kind === kind)
                  .map((item, index) => {
                    const f = itemFinancials(item);
                    return (
                      <tr key={`${item.code}:${index}`}>
                        <td>
                          <strong>
                            {kind === "material" && /^[1-9]\d{0,17}$/.test(item.code) ? (
                              <a className="crm-summary-product-link" href={"/analise-materiais?" + new URLSearchParams({code:item.code})} target="_blank" rel="noopener noreferrer" title="Ver fotos, estoque e informações do produto em outra aba">
                                {item.code}
                              </a>
                            ) : item.code} · {item.name}
                          </strong>
                          {item.notes?.trim() && (
                            <small className="crm-prewrap">
                              Observação: {item.notes}
                            </small>
                          )}
                          {item.internalNotes && (
                            <small>
                              Observação interna: {item.internalNotes}
                            </small>
                          )}
                        </td>
                        <td>{item.quote?.unit || "—"}</td>
                        <td>
                          <input className="crm-summary-quantity-input"
                            aria-label={`Quantidade: ${item.name}`} type="number"
                            min="0.001" max="9999999.999" step="0.001"
                            disabled={disabled} value={item.quantity}
                            onChange={(e) => onChange(draft.items.map((row) =>
                              row === item ? { ...row, quantity: e.target.value } : row,
                            ))} />
                        </td>
                        <td>
                          <input className="crm-summary-price-input"
                            aria-label={`Venda unitária: ${item.name}`} type="number"
                            min="0" max="99999999.99" step="0.01"
                            disabled={disabled} value={item.price}
                            onChange={(e) => onChange(draft.items.map((row) =>
                              row === item ? { ...row, price: e.target.value } : row,
                            ))} />
                          {Number(item.discountPercent) > 0 && (
                            <small>
                              Líquido: {cash(discountedUnitCents(item))}
                            </small>
                          )}
                        </td>
                        <td>
                          <input
                            className="crm-discount-input"
                            aria-label={`Desconto (%): ${item.name}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0"
                            disabled={disabled}
                            value={item.discountPercent ?? ""}
                            aria-invalid={
                              !!item.discountPercent &&
                              (!/^\d{1,3}(\.\d{1,2})?$/.test(
                                item.discountPercent,
                              ) ||
                                Number(item.discountPercent) > 100)
                            }
                            onChange={(e) =>
                              onChange(
                                draft.items.map((row) =>
                                  row === item
                                    ? {
                                        ...row,
                                        discountPercent: e.target.value,
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>{cash(f.sale)}</td>
                        <td>
                          {kind === "service" ? (
                            <input
                              className="crm-service-cost-input"
                              aria-label={`Custo unitário: ${item.name}`}
                              type="number"
                              min="0"
                              max="99999999.99"
                              step="0.01"
                              placeholder="Não informado"
                              disabled={disabled}
                              value={item.unitCost ?? ""}
                              onChange={(e) => onChange(draft.items.map((row) =>
                                row === item ? { ...row, unitCost: e.target.value } : row,
                              ))}
                            />
                          ) : item.unitCost
                            ? Number(item.unitCost).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "Não informado"}
                        </td>
                        <td>{cash(f.cost)}</td>
                        <td
                          className={(f.profit ?? 0) < 0 ? "crm-negative" : ""}
                        >
                          {cash(f.profit)}
                        </td>
                        <td>{percent(f.margin)}</td>
                        <td>
                          <button type="button" className="crm-summary-remove" disabled={disabled}
                            aria-label={`Remover item: ${item.name}`} title="Remover da proposta"
                            onClick={() => onChange(draft.items.filter((row) => row !== item))}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {!draft.items.some((i) => i.kind === kind) && (
            <p>Nenhum item selecionado.</p>
          )}
        </section>
      ))}
      {draft.notes && (
        <section>
          <h3>Escopo / observações</h3>
          <p className="crm-prewrap">{draft.notes}</p>
        </section>
      )}
      {draft.internalNotes && (
        <section>
          <h3>Observações internas</h3>
          <p className="crm-prewrap">{draft.internalNotes}</p>
        </section>
      )}
    </section>
  );
}
