"use client";
import type { OrderDraft, OrderItem } from "@/lib/service-orders/model";
import { currentTaxes, deliveryTerm } from "@/lib/crm/product-terms";
import { crmMoney } from "./crm-api";
export default function CrmProductTerms({
  draft,
  item,
  disabled,
  onChange,
  showDelivery = true,
}: {
  showDelivery?: boolean;
  draft: OrderDraft;
  item: OrderItem;
  disabled: boolean;
  onChange: (item: OrderItem) => void;
}) {
  const taxes = currentTaxes(draft, item);
  return (
    <div className="crm-product-terms">
      <small>
        Estoque disponível:{" "}
        <span
          title={
            item.stockAt
              ? `Estoque consultado em ${new Date(item.stockAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
              : undefined
          }
        >
          {item.availableStock == null
            ? "Não informado"
            : item.availableStock.toLocaleString("pt-BR")}{" "}
          {item.quote?.unit || ""}
        </span>
      </small>
      {showDelivery && (
        <CrmDeliveryTerm
          draft={draft}
          item={item}
          disabled={disabled}
          onChange={onChange}
        />
      )}
      {taxes ? (
        <small>
          Impostos simulados: ICMS {crmMoney(taxes.icms)} · ICMS ST{" "}
          {crmMoney(taxes.icmsSt)} · IPI {crmMoney(taxes.ipi)} · PIS{" "}
          {crmMoney(taxes.pis)} · COFINS {crmMoney(taxes.cofins)}
        </small>
      ) : (
        <small>Impostos não calculados para estes dados.</small>
      )}
    </div>
  );
}

export function CrmDeliveryTerm({
  draft,
  item,
  disabled,
  onChange,
}: {
  draft: OrderDraft;
  item: OrderItem;
  disabled: boolean;
  onChange: (item: OrderItem) => void;
}) {
  return (
    <div className="crm-product-terms crm-delivery-term">
      <label>
        Prazo de entrega
        <input
          aria-label={`Prazo de entrega: ${item.name}`}
          maxLength={100}
          disabled={disabled}
          placeholder={deliveryTerm(draft, { ...item, deliveryLeadTime: "" })}
          value={item.deliveryLeadTime || ""}
          onChange={(e) =>
            onChange({ ...item, deliveryLeadTime: e.target.value })
          }
        />
      </label>
      <small>
        {item.deliveryLeadTime
          ? "Prazo definido pelo vendedor"
          : `Automático: ${deliveryTerm(draft, item)}`}
        . Deixe vazio para usar o automático.
      </small>
    </div>
  );
}
