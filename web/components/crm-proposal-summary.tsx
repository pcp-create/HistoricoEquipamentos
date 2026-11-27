"use client";
import CrmServiceCostInput from "./crm-service-cost-input";
import CrmProductTerms, { CrmDeliveryTerm } from "./crm-product-terms";
import {itemPriceKey} from "@/lib/crm/item-price-key";
import { Trash2, ShieldCheck } from "lucide-react";
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
  onChange,
  disabled = false,
  approvals = [], canApprove = false, onApprove, leadId = "",
}: {
  draft: OrderDraft;
  onChange: (items: OrderDraft["items"]) => void;
  disabled?: boolean;
  approvals?: any[]; canApprove?: boolean; onApprove?: (code:string)=>Promise<void>; leadId?: string;
}) {
  const totals = proposalFinancials(draft.items);
  return (
    <section
      className="crm-proposal-summary"
      aria-label="Resumo geral da proposta"
    >
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
                  {kind === "material" && <th>Prazo de entrega</th>}
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
                    const minimum = item.quote?.minimumPrice;
                    const below = kind === "material" && minimum != null && minimum !== "" && Number.isFinite(Number(minimum)) && discountedUnitCents(item) < Math.ceil(Number(minimum)*100-1e-7);
                    const approval = below && approvals.find(a=>a.item_key===itemPriceKey(draft,item,leadId)&&Number(a.minimum_price)>=Number(minimum));
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
                          {kind === 'material' && <CrmProductTerms showDelivery={false} showTaxes={false} draft={draft} item={item} disabled={disabled} onChange={next=>onChange(draft.items.map(row=>row===item?next:row))}/>}
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
                        {kind === "material" && <td><CrmDeliveryTerm compact draft={draft} item={item} disabled={disabled} onChange={next=>onChange(draft.items.map(row=>row===item?next:row))}/></td>}
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
                          <div className="crm-summary-price-field">
                          <input className="crm-summary-price-input"
                            aria-label={`Venda unitária: ${item.name}`} type="number"
                            min="0" max="99999999.99" step="0.01"
                            disabled={disabled} value={item.price}
                            onChange={(e) => onChange(draft.items.map((row) =>
                              row === item ? { ...row, price: e.target.value } : row,
                            ))} />
                          {Number(item.discountPercent) > 0 && (
                            <small className="crm-summary-net-price">
                              Líquido: {cash(discountedUnitCents(item))}
                            </small>
                          )}
                          </div>
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
                        <td>{cash(f.sale)}
                          {below && (approval ? <small className="crm-item-price-approved"><ShieldCheck size={13}/>Aprovado por {approval.approved_name}</small> : <div className="crm-summary-minimum-warning" role="status"><strong>Aprovação necessária</strong><small>Valor com desconto abaixo do mínimo de {cash(Math.ceil(Number(minimum)*100-1e-7))} por unidade.</small><button type="button" disabled={disabled || !canApprove} onClick={()=>void onApprove?.(item.code)}><ShieldCheck size={14}/>Aprovar desconto</button>{!canApprove&&<small>Solicite aprovação a um Gestor, Coordenador, Diretor ou Administrador.</small>}</div>)}
                        </td>
                        <td>
                          {kind === "service" ? (
                            <CrmServiceCostInput
                              className="crm-service-cost-input"
                              aria-label={`Custo unitário: ${item.name}`}
                              disabled={disabled}
                              value={item.unitCost ?? ""}
                              onChange={value => onChange(draft.items.map(row =>
                                row === item ? { ...row, unitCost: value } : row,
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
