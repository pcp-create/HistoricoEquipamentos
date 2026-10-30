import type {
  WorkshopFinancial,
  WorkshopFinancialBucket,
} from "@/lib/workshop/financial";
export const workshopMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function WorkshopValue({
  financial,
}: {
  financial?: WorkshopFinancial;
}) {
  if (!financial) return null;
  const fallback: WorkshopFinancialBucket = {
    total: financial.total,
    missing: financial.missing,
    count: financial.orders.length,
  };
  const unknown: WorkshopFinancialBucket = {
    total: financial.unlinked ? null : 0,
    missing: 0,
    count: 0,
  };
  const values = financial.breakdown || {
    approved: financial.kind === "sale" ? fallback : unknown,
    quotation: { total: 0, missing: 0, count: 0 },
    cost: financial.kind === "cost" ? fallback : unknown,
  };
  const rows = [
    {
      id: "approved",
      label: "Aprovado",
      value: values.approved,
      description: "OSs de cobrança abertas",
    },
    {
      id: "quotation",
      label: "Em orçamento",
      value: values.quotation,
      description: "Orçamentos M8 vinculados em aberto",
    },
    {
      id: "cost",
      label: "Custo",
      value: values.cost,
      description: "OSs de custo abertas",
    },
  ];
  return (
    <div className="ws-financial-value ws-financial-breakdown">
      {rows.map(({ id, label, value, description }) => (
        <div
          key={id}
          className={`ws-financial-line ws-financial-${id}${value.total === null || value.count === 0 ? " ws-financial-muted" : ""}`}
          title={`${description} · ${value.count} registro(s)${value.missing ? " · " + value.missing + " sem valor informado" : ""}`}
        >
          <span className="ws-financial-kind">
            <i aria-hidden="true" />
            {label}
          </span>
          <strong
            aria-label={
              value.total === null
                ? label + ": valor não disponível"
                : value.total === 0 ? label + ": valor zerado" : undefined
            }
          >
            {value.total === null ? "—" : value.total === 0 ? "-" : workshopMoney(value.total)}
          </strong>
        </div>
      ))}
      {financial.unlinked && <small>Equipamento sem vínculo</small>}
      {rows.some((r) => r.value.missing > 0) && (
        <small>Há valores não informados</small>
      )}
    </div>
  );
}
