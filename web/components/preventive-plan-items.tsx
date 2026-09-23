"use client";
import { useState } from "react";
import PreventivePlanHistory from "./preventive-plan-history";
import QuoteCatalogPicker from "./quote-catalog-picker";
import type { PlanItem } from "@/lib/equipment-management/plan-items";
import { quoteItemIdentity, type QuoteItem } from "@/lib/quotes/types";
export default function PreventivePlanItems({
  items,
  onChange,
  disabled,
  equipment,
  clients,
}: {
  equipment: { id: string; serial?: string; model?: string };
  clients: { id: string; name: string; priority?: number }[];
  items: PlanItem[];
  onChange: (items: PlanItem[]) => void;
  disabled: boolean;
}) {
  const [kind, setKind] = useState<QuoteItem["kind"] | null>(null);
  const add = (i: QuoteItem) => {
    const product =
      i.products?.find((p) => Number(p.company_id) === 1) || i.products?.[0];
    const registeredUnit = (product ? product.unit || "" : i.unit).trim();
    if (
      !disabled &&
      items.length < 100 &&
      !items.some((v) => v.kind === i.kind && v.code === i.code)
    )
      onChange([
        ...items,
        {
          kind: i.kind,
          code: i.code,
          name: i.name,
          unit: i.kind === "service" ? i.unit : registeredUnit,
          unitEditable: i.kind === "service" || !registeredUnit,
          quantity: "1",
        },
      ]);
  };
  return (
    <section className="preventive-plan-items">
      <h3>Materiais e serviços da preventiva</h3>
      <p className="muted">
        Cadastre os itens e quantidades previstos para esta revisão. Eles serão
        incluídos no rascunho de orçamento.
      </p>
      <PreventivePlanHistory
        key={equipment.id}
        equipment={equipment}
        clients={clients}
        existing={new Set(items.map((i) => `${i.kind}:${i.code}`))}
        onAdd={add}
        disabled={disabled || items.length >= 100}
      />
      <div className="catalog-editor-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || items.length >= 100}
          onClick={() => setKind("material")}
        >
          Adicionar material
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || items.length >= 100}
          onClick={() => setKind("service")}
        >
          Adicionar serviço
        </button>
      </div>
      {items.length ? (
        <div className="equipment-table">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Unidade</th>
                <th>Quantidade</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, index) => (
                <tr key={`${i.kind}:${i.code}`}>
                  <td>
                    <strong>{i.name}</strong>
                    <small>
                      {i.kind === "material" ? "Material" : "Serviço"} · Cód.{" "}
                      {i.code}
                    </small>
                  </td>
                  <td>
                    {i.kind === "service" ||
                    i.unitEditable ||
                    !i.unit.trim() ? (
                      <input
                        aria-label={`Unidade de ${i.name}`}
                        value={i.unit}
                        maxLength={60}
                        disabled={disabled}
                        placeholder="Ex.: pacote, hora, UN"
                        onChange={(e) =>
                          onChange(
                            items.map((v, n) =>
                              n === index
                                ? {
                                    ...v,
                                    unit: e.target.value,
                                    unitEditable: true,
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                    ) : (
                      i.unit
                    )}
                  </td>
                  <td>
                    <input
                      aria-label={`Quantidade de ${i.name}`}
                      type="number"
                      min="0.001"
                      max="1000000"
                      step="0.001"
                      required
                      value={i.quantity}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange(
                          items.map((v, n) =>
                            n === index
                              ? { ...v, quantity: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={disabled}
                      onClick={() =>
                        onChange(items.filter((_, n) => n !== index))
                      }
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhum material ou serviço cadastrado neste plano.</p>
      )}
      {kind && (
        <QuoteCatalogPicker
          kind={kind}
          existing={
            new Set(
              items.map((i) =>
                quoteItemIdentity({
                  ...i,
                  key: `${i.kind}:${i.code}`,
                } as QuoteItem),
              ),
            )
          }
          onClose={() => setKind(null)}
          onAdd={add}
        />
      )}
    </section>
  );
}
