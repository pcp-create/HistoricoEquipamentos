import { priceComparison, type ProductCurrent } from "@/lib/product-values";
const qty = (n: string | number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
        Number(n),
      );
const money = (n: string | number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(n));
function Stamp({
  at,
  minutes,
}: {
  at: string | null | undefined;
  minutes: number;
}) {
  if (!at) return <small className="cell-secondary">Aguardando coleta</small>;
  const stale = Date.now() - new Date(at).getTime() > minutes * 60000;
  return (
    <small className={stale ? "excluded-label" : "cell-secondary"}>
      {stale ? "Desatualizado · " : "Coletado · "}
      {new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(at))}
    </small>
  );
}
export function StockValues({ current }: { current?: ProductCurrent }) {
  return (
    <div className="product-values">
      <span>
        Estoque: <b>{qty(current?.stock)}</b> {current?.unit}
      </span>
      <Stamp at={current?.stock_at} minutes={120} />
      <span>
        Disponível: <b>{qty(current?.available)}</b> {current?.unit}
      </span>
      <Stamp at={current?.available_at} minutes={15} />
      <small className="cell-secondary">
        Valor estimado a custo médio: {money(current?.stock_value)}
      </small>
    </div>
  );
}
export function PriceValues({ current }: { current?: ProductCurrent }) {
  return (
    <div className="product-values">
      <span>
        Venda: <b>{money(current?.sale_price)}</b>
      </span>
      <span>
        Mínimo: <b>{money(current?.minimum_price)}</b>
      </span>
      <small className="cell-secondary">
        Por {current?.unit || "unidade não informada"} · preços atuais
      </small>
      <Stamp at={current?.price_at} minutes={30} />
    </div>
  );
}
export function SoldValues({
  amount,
  quantity,
  unit,
  current,
  excluded,
}: {
  amount?: string | null;
  quantity?: string | null;
  unit?: string | null;
  current?: ProductCurrent;
  excluded?: boolean;
}) {
  const comparison = priceComparison(amount, quantity, unit, current, excluded);
  return (
    <div className="product-values">
      <b>{money(comparison.effective)}</b>
      <small className="cell-secondary">Total do item ÷ quantidade</small>
      {comparison.difference !== null ? (
        <small
          className={
            comparison.difference < 0 ? "excluded-label" : "cell-secondary"
          }
        >
          {comparison.difference < 0
            ? "Abaixo do mínimo atual"
            : "Diferença do mínimo atual"}
          : {money(comparison.difference)}
          {comparison.percent === null ? "" : ` (${qty(comparison.percent)}%)`}
        </small>
      ) : (
        <small className="cell-secondary">
          {excluded
            ? "Excluído · sem comparação"
            : "Sem mínimo ou unidade compatível"}
        </small>
      )}
    </div>
  );
}
