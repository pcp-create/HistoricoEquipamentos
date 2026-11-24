"use client";
import { ArrowDownToLine } from "lucide-react";
import { useId, useState } from "react";
import ProductReservations from "./product-reservations";
import { companyName, companyNamesInText } from "@/lib/company-names";

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

function UnitPriceInput({value, onChange, belowMinimum = false}: {value:string;onChange:(value:string)=>void;belowMinimum?:boolean}) {
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");
  const display = value !== "" && Number.isFinite(Number(value))
    ? Number(value).toLocaleString("pt-BR", {minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}) : "";
  return <input aria-label="Valor unitário (R$)" className={belowMinimum ? "quote-price-below-minimum" : undefined} type="text" inputMode="decimal"
    value={editing ? typed : display} placeholder="Informar"
    onFocus={() => {setEditing(true);setTyped(value ? String(Number(value)).replace(".",",") : "");}}
    onChange={event => {
      const raw=event.target.value.replace(".",",");
      if (!/^\d*(,\d{0,2})?$/.test(raw)) return;
      const number=raw.replace(",", ".");
      if (Number(number)>10000000) return;
      setTyped(raw);onChange(number === "." ? "" : number);
    }}
    onBlur={() => {setEditing(false);if(value !== "" && Number.isFinite(Number(value))) onChange(Number(value).toFixed(2));}}
  />;
}

export default function QuoteItemRow({
  item,
  reference,
  history,
  products,
  serial,
  onChange,
  onRemove,
  duplicate = false,
  descriptionDetails,
  showTaskAction = true,
  compactPricing = false,
}: {
  duplicate?: boolean;
  showTaskAction?: boolean;
  compactPricing?: boolean;
  descriptionDetails?: import("react").ReactNode;
  item: QuoteItem;
  reference?: QuoteItem;
  history?: QuoteSalesHistory;
  products?: CatalogProduct[];
  serial: string;
  onChange: (patch: Partial<QuoteItem>) => void;
  onRemove?: () => void;
}) {
  const [pricesExpanded, setPricesExpanded] = useState(false);
  const pricesId = useId();
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
  const manufacturerReferences =
    [
      ...new Set(
        (stock?.companies || [])
          .map((p) => p.reference?.trim())
          .filter(Boolean),
      ),
    ].join(" · ") || (item.key.startsWith("m:") ? item.code : "");
  const amount = lineAmount(item);
  const below =
    item.selected &&
    item.price !== "" &&
    ref.minimumPrice !== "" &&
    Number(item.price) < Number(ref.minimumPrice);
  const manual = item.key.startsWith("manual:");
  function priceShortcut(value: string, label: string) {
    if (value === "" || !Number.isFinite(Number(value))) return "—";
    return <button type="button" className="quote-price-apply"
      aria-label={`Aplicar ${label}: ${money(value)}`} title="Aplicar ao valor unitário"
      onClick={() => onChange({price:Number(value).toFixed(2)})}>
      {money(value)}<ArrowDownToLine size={16} aria-hidden="true" />
    </button>;
  }
  return (
    <article className={`quote-choice${compactPricing ? " quote-choice-compact" : ""}${compactPricing && item.kind === "service" ? " quote-choice-service" : ""}${item.selected ? " is-selected" : ""}`}>
      <div className="quote-choice-line">
        <input
          className="quote-choice-check"
          type="checkbox"
          checked={item.selected}
          disabled={duplicate && !item.selected}
          title={
            duplicate
              ? "Este item já está selecionado em outra linha."
              : undefined
          }
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
            Cód.{" "}
            {item.kind === "material" &&
            !item.key.startsWith("m:") &&
            /^[1-9]\d{0,17}$/.test(item.code) ? (
              <a
                className="quote-order-link"
                href={
                  "/analise-materiais?" +
                  new URLSearchParams({ code: item.code })
                }
                target="_blank"
                rel="noopener noreferrer"
                title="Consultar material na Análise de materiais em outra aba"
              >
                {item.code}
              </a>
            ) : (
              item.code || "manual"
            )}
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
            <small className="quote-choice-manufacturer">
              Ref. fabricante: {manufacturerReferences || "Não informada"}
            </small>
          )}
          {descriptionDetails}
          {item.kind === "material" && !descriptionDetails && (
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
          {!compactPricing && <ProductReservations orders={stock?.reservedOrders} showCompany/>}
          {!!stock?.blockedCompanies.length && (
            <small className="quote-warning">
              Bloqueado no M8 · empresa(s){" "}
              {stock.blockedCompanies.map(companyName).join(", ")}
            </small>
          )}
        </div>
        {compactPricing && item.kind === "service" && (
          <label className="quote-choice-unit">
            Unidade
            <select aria-label={`Unidade: ${item.name}`} value={item.unit} onChange={(e) => onChange({unit:e.target.value})}>
              {!item.unit && <option value="">Selecione</option>}
              {Array.from(new Set([item.unit, "UNIDADE", "PCT", "HORA", "DIÁRIA", "SERVIÇO"].filter(Boolean))).map(unit => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
        )}
        <div className="quote-choice-reference">
          <div className="quote-last-sale">
          <small>
            {general
              ? "Última venda · base geral"
              : "Última venda · cliente/equipamento"}
          </small>
          {last && (
            <small>
              {day(last.date)} · <QuoteOrderLink sale={last} showTaskAction={showTaskAction} />
            </small>
          )}
          {compactPricing && last?.unitPrice ? <button type="button" className="quote-price-apply"
            aria-label={`Aplicar última venda: ${money(last.unitPrice)}`}
            title="Aplicar ao valor unitário" onClick={() => onChange({price:Number(last.unitPrice).toFixed(2)})}>
            {money(last.unitPrice)}<ArrowDownToLine size={16} aria-hidden="true" />
          </button> : <strong>{last ? money(last.unitPrice) : "Sem histórico"}</strong>}
          </div>
          {compactPricing && <button type="button" className="quote-price-toggle" aria-expanded={pricesExpanded} aria-controls={pricesId} onClick={() => setPricesExpanded(value => !value)}>{pricesExpanded ? "Ocultar preços de referência" : "Ver preços de referência"}</button>}
          {compactPricing ? <div id={pricesId} className={`quote-price-comparisons${pricesExpanded ? " is-expanded" : ""}`}>
            <div className="quote-price-pair" aria-label="Preços M8">
              <div><small>Mínimo M8</small>{priceShortcut(ref.minimumPrice, "mínimo M8")}</div>
              <div><small>Venda M8</small>{priceShortcut(ref.referencePrice, "venda M8")}</div>
            </div>
            {history && !general && <div className="quote-price-pair" aria-label="Preços vendidos">
              <div><small>Mínimo vendido</small>{priceShortcut(history.minimum, "mínimo vendido")}</div>
              <div><small>Máximo vendido</small>{priceShortcut(history.maximum, "máximo vendido")}</div>
            </div>}
          </div> : <small>
            Venda M8: {money(ref.referencePrice)} · Mín. M8: {money(ref.minimumPrice)}
          </small>}
          {!compactPricing && history && !general && (
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
          <UnitPriceInput value={item.price} belowMinimum={below} onChange={price => onChange({price})} />
        </label>
        <div className="quote-choice-total">
          <small>Total</small>
          <strong>{amount === null ? "—" : money(String(amount / 100))}</strong>
        </div>
      </div>
      <div className="quote-choice-actions">
        {duplicate && !item.selected && (
          <small className="quote-warning">
            Já selecionado em outra linha.
          </small>
        )}
        {!compactPricing && last?.unitPrice !== undefined && last.unitPrice !== "" && (
          <button
            type="button"
            onClick={() =>
              onChange({ price: Number(last.unitPrice).toFixed(2) })
            }
          >
            Usar última venda: {money(last.unitPrice)}
          </button>
        )}
        {!compactPricing && ref.referencePrice !== "" && (
          <button
            type="button"
            onClick={() =>
              onChange({ price: Number(ref.referencePrice).toFixed(2) })
            }
          >
            Usar venda M8: {money(ref.referencePrice)}
          </button>
        )}
        {(manual || !ref.unit) && !(compactPricing && item.kind === "service") && (
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
        {!compactPricing && onRemove && (
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
        {compactPricing && <div className="quote-price-details">
          <ProductReservations orders={stock?.reservedOrders} showCompany/>
        </div>}
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
                    <th>OS / cliente</th>
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
                        <QuoteOrderLink sale={sale} showTaskAction={showTaskAction} /> ·{" "}
                        {sale.customer || "Cliente não informado"}
                        <small className="quote-sale-origin">{sale.equipment || "Equipamento não informado"}</small>
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
        <p className="muted">{companyNamesInText(ref.source)}</p>
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
