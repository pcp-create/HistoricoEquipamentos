"use client";

import {
  lineAmount,
  type QuoteItem,
  type QuoteSalesHistory,
} from "@/lib/quotes/types";
import {
  groupedProducts,
  type CatalogProduct,
} from "@/lib/manufacturer/products";
import CatalogProducts from "./catalog-products";
import { quoteOrigin } from "@/lib/quotes/presentation";
import QuoteOrderLink from "./quote-order-link";

const money = (value: string) =>
  value !== "" && Number.isFinite(Number(value))
    ? new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(value))
    : "—";
const quantity = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(
    Number(value),
  );
const day = (value: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : "Data não informada";

export default function QuoteItemRow({
  item,
  reference,
  history,
  products,
  serial,
  onChange,
  onRemove,
}: {
  item: QuoteItem;
  reference?: QuoteItem;
  history?: QuoteSalesHistory;
  products?: CatalogProduct[];
  serial: string;
  onChange: (patch: Partial<QuoteItem>) => void;
  onRemove?: () => void;
}) {
  products = products?.length
    ? products
    : reference?.products?.length
      ? reference.products
      : item.products || [];
  const origin = quoteOrigin(reference || item, products);
  const general = item.source.startsWith("Base geral");
  const ref = general ? item : reference || item;
  if (general)
    history = item.generalSale
      ? { count: 1, minimum: "", maximum: "", rows: [item.generalSale] }
      : undefined;
  const last = history?.rows[0];
  const stock = groupedProducts(products)[0];
  const amount = lineAmount(item);
  const below =
    item.selected &&
    item.price !== "" &&
    ref.minimumPrice !== "" &&
    Number(item.price) < Number(ref.minimumPrice);
  const manual = item.key.startsWith("manual:");
  return (
    <article className={`quote-choice${item.selected ? " is-selected" : ""}`}>
      <div className="quote-choice-line">
        <input
          className="quote-choice-check"
          type="checkbox"
          checked={item.selected}
          aria-label={`Incluir ${item.name}`}
          onChange={(e) => onChange({ selected: e.target.checked })}
        />
        <div className="quote-choice-product">
          {manual ? (
            <label>
              Descrição
              <input
                value={item.name}
                maxLength={500}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </label>
          ) : (
            <strong>{item.name}</strong>
          )}
          <small>
            Cód. {item.code || "manual"}
            {item.unit && ` · ${item.unit}`}
            {origin !== "unknown" && (
              <span className={`quote-choice-origin quote-origin-${origin}`}>
                {" "}
                · {origin === "genuine" ? "Genuína" : "Similar"}
              </span>
            )}
            {origin === "unknown" &&
              ` · ${item.kind === "service" ? "Serviço" : "Material"}`}
          </small>
          {item.kind === "material" && (
            <small className="quote-choice-stock">
              Estoque:{" "}
              <b
                className={
                  stock?.stock.complete &&
                  stock.available.complete &&
                  stock.stock.value! > stock.available.value!
                    ? "stock-alert"
                    : ""
                }
              >
                {stock?.stock.value == null
                  ? "A consultar"
                  : `${quantity(stock.stock.value)} ${stock.unit}`}
              </b>
              {" · Disponível: "}
              <b
                className={
                  stock?.available.complete
                    ? stock.available.value! > 0
                      ? "stock-positive"
                      : "stock-zero"
                    : ""
                }
              >
                {stock?.available.value == null
                  ? "A consultar"
                  : `${quantity(stock.available.value)} ${stock.unit}`}
              </b>
              {stock &&
                (!stock.stock.complete || !stock.available.complete) &&
                " · saldo incompleto"}
            </small>
          )}
          {!!stock?.blockedCompanies.length && (
            <small className="quote-warning">
              Bloqueado no M8 · empresa(s) {stock.blockedCompanies.join(", ")}
            </small>
          )}
        </div>
        <div className="quote-choice-reference">
          <small>
            {general
              ? "Última venda · base geral"
              : "Última venda · cliente/equipamento"}
          </small>
          <strong>{last ? money(last.unitPrice) : "Sem histórico"}</strong>
          {last && (
            <small>
              {day(last.date)} · <QuoteOrderLink sale={last} />
            </small>
          )}
          <small>
            Venda M8: {money(ref.referencePrice)} · Mín. M8:{" "}
            {money(ref.minimumPrice)}
          </small>
          {history && !general && (
            <small>
              Mín./máx. vendido: {money(history.minimum)} a{" "}
              {money(history.maximum)}
            </small>
          )}
        </div>
        <label className="quote-choice-quantity">
          Qtd.
          <input
            aria-label="Quantidade"
            type="number"
            min="0.001"
            max="1000000"
            step="0.001"
            value={item.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
          />
        </label>
        <label className="quote-choice-price">
          Unitário (R$)
          <input
            aria-label="Valor unitário (R$)"
            type="number"
            min="0"
            max="10000000"
            step="0.01"
            value={item.price}
            placeholder="Informar"
            onChange={(e) => onChange({ price: e.target.value })}
          />
        </label>
        <div className="quote-choice-total">
          <small>Total</small>
          <strong>{amount === null ? "—" : money(String(amount / 100))}</strong>
        </div>
      </div>
      <div className="quote-choice-actions">
        {last?.unitPrice !== undefined && last.unitPrice !== "" && (
          <button
            type="button"
            onClick={() =>
              onChange({ price: Number(last.unitPrice).toFixed(2) })
            }
          >
            Usar última venda: {money(last.unitPrice)}
          </button>
        )}
        {ref.referencePrice !== "" && (
          <button
            type="button"
            onClick={() =>
              onChange({ price: Number(ref.referencePrice).toFixed(2) })
            }
          >
            Usar venda M8: {money(ref.referencePrice)}
          </button>
        )}
        {(manual || !ref.unit) && (
          <label>
            Unidade
            <input
              maxLength={60}
              value={item.unit}
              placeholder="UN, H…"
              onChange={(e) => onChange({ unit: e.target.value })}
            />
          </label>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove}>
            Remover item
          </button>
        )}
        {below && (
          <small className="quote-warning quote-below-minimum">
            Valor abaixo do mínimo M8: {money(ref.minimumPrice)}.
          </small>
        )}
        {item.selected && amount === null && (
          <small className="quote-warning">Preencha quantidade e preço.</small>
        )}
      </div>
      <details className="quote-choice-details">
        <summary>
          Mais informações{history ? ` · ${history.count} OS` : ""}
        </summary>
        <h4>
          {general
            ? "Última venda geral · todos os clientes e equipamentos"
            : "Últimas vendas para este cliente e equipamento"}
        </h4>
        {history?.rows.length ? (
          <>
            {general && last?.customer && <p>Cliente: {last.customer}</p>}
            <p className="muted">
              {general
                ? "Referência da última OS processada com coleta concluída na mesma unidade, entre as três empresas."
                : "Até 5 OS mais recentes. Mínimo e máximo consideram todo o histórico disponível, na mesma unidade. Valores unitários líquidos calculados pelo total ÷ quantidade."}
            </p>
            <div className="quote-sales-table">
              <table>
                <thead>
                  <tr>
                    <th>OS / empresa</th>
                    <th>Data</th>
                    <th>Qtd.</th>
                    <th>Unitário</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((sale) => (
                    <tr key={`${sale.company}:${sale.order}`}>
                      <td>
                        <QuoteOrderLink sale={sale} /> · {sale.company}
                        {sale.linkedByObservation && (
                          <small className="quote-sale-origin">
                            Série nas observações
                          </small>
                        )}
                      </td>
                      <td>{day(sale.date)}</td>
                      <td>
                        {quantity(sale.quantity)} {item.unit}
                      </td>
                      <td>{money(sale.unitPrice)}</td>
                      <td>{money(sale.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">
            {general
              ? "Nenhuma venda registrada na base geral para esta unidade."
              : "Nenhuma venda encontrada para este cliente e equipamento na mesma unidade."}
          </p>
        )}
        {products.length > 0 && (
          <>
            <h4>Cadastro e estoque por empresa</h4>
            <CatalogProducts
              products={products}
              serial={serial}
              matchContext={origin !== "unknown"}
            />
          </>
        )}
        <p className="muted">{ref.source}</p>
        {ref.referenceAt && (
          <small>Referência registrada em {day(ref.referenceAt)}.</small>
        )}
        {!history &&
          item.kind === "service" &&
          ref.lastPrice !== "" &&
          ref.source.startsWith("Base de serviços") && (
            <p>
              Referência da base de serviços (outros atendimentos):{" "}
              {money(ref.lastPrice)}{" "}
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  onChange({ price: Number(ref.lastPrice).toFixed(2) })
                }
              >
                Usar referência da base
              </button>
            </p>
          )}
      </details>
    </article>
  );
}
