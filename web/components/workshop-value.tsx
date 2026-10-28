import type { WorkshopFinancial } from "@/lib/workshop/financial";
export const workshopMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function WorkshopValue({
  financial,
}: {
  financial?: WorkshopFinancial;
}) {
  if (!financial) return null;
  return (
    <div className="ws-financial-value">
      <span>
        {financial.kind === "cost"
          ? "Custo das OSs abertas"
          : "Venda das OSs de cobrança abertas"}
      </span>
      <strong>
        {financial.total === null
          ? "Não disponível"
          : workshopMoney(financial.total)}
      </strong>
      <small>{financial.orders.length} OS(s) em aberto</small>
      {financial.missing > 0 && (
        <small>{financial.missing} OS(s) sem valor informado</small>
      )}
      {financial.unlinked && (
        <small>Vincule o equipamento para consultar os valores.</small>
      )}
    </div>
  );
}
