import { companyName } from "@/lib/company-names";
import {
  groupedProducts,
  type CatalogProduct,
} from "@/lib/manufacturer/products";
import { StockValues, PriceValues } from "./product-values";
import ProductPhotos from "./product-photos";
const quantity = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(n);
const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n,
  );
function Collection({ at, minutes }: { at: string | null; minutes: number }) {
  if (!at)
    return <small className="catalog-collected">Coleta incompleta</small>;
  const stale = Date.now() - Date.parse(at) > minutes * 60000;
  return (
    <small
      className={`catalog-collected${stale ? " stale" : ""}`}
      title="Data mais antiga entre as empresas somadas"
    >
      {stale ? "Desatualizado" : "Coletado"} ·{" "}
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
function Balance({
  label,
  total,
  unit,
  available = false,
  warning = false,
  at,
  minutes,
}: {
  label: string;
  total: { value: number | null; complete: boolean };
  unit: string;
  available?: boolean;
  warning?: boolean;
  at: string | null;
  minutes: number;
}) {
  const state = !total.complete
    ? "unknown"
    : total.value! > 0
      ? "positive"
      : "zero";
  return (
    <span
      className={`catalog-balance ${state}${available ? " available" : ""}${warning ? " stock-warning" : ""}`}
      title={warning ? "Estoque total maior que o disponível." : undefined}
    >
      <span>
        {label}
        {!total.complete && total.value !== null ? " conhecido" : ""}:
      </span>{" "}
      <b>
        {total.value === null ? (
          "A consultar"
        ) : (
          <>
            <span className="catalog-number">{quantity(total.value)}</span>{" "}
            {unit}
          </>
        )}
      </b>
      {!total.complete && <em>Saldo incompleto</em>}
      <Collection at={at} minutes={minutes} />
    </span>
  );
}
export default function CatalogProducts({
  products,
  serial,
  matchContext = true,
}: {
  products: CatalogProduct[];
  matchContext?: boolean;
  serial: string;
}) {
  const groups = groupedProducts(products);
  return (
    <>
      {groups.map((p) => {
        return (
          <details className="manual-product" key={p.id}>
            <summary className="catalog-product-summary">
              <span className="catalog-product-label">
                <strong className="catalog-product-name">
                  {p.name || `Produto ${p.id}`}
                </strong>
                <small>
                  ID {p.id} · {p.companies.length}{" "}
                  {p.companies.length === 1 ? "empresa" : "empresas"}
                </small>
                <small>
                  Ref. fabricante:{" "}
                  {[
                    ...new Set(
                      p.companies
                        .map((c) => c.reference?.trim())
                        .filter(Boolean),
                    ),
                  ].join(" · ") || "Não informada"}
                </small>
                {p.blockedCompanies.length > 0 && (
                  <small className="catalog-blocked">
                    {p.blockedCompanies.length === p.companies.length
                      ? "Bloqueado no M8"
                      : `Bloqueado no M8 · Empresas ${p.blockedCompanies.map(companyName).join(", ")}`}
                  </small>
                )}
                {p.fields.includes("referenciaFabricante") && (
                  <small className="catalog-genuine">
                    Referência fabricante (Genuína)
                  </small>
                )}
                {p.fields.includes("codigoSimilaridade") && (
                  <small>Código de similaridade</small>
                )}
              </span>
              <span className="catalog-stock-summary">
                <Balance
                  label="Estoque"
                  total={p.stock}
                  unit={p.unit}
                  at={p.stockAt}
                  minutes={120}
                  warning={
                    p.stock.complete &&
                    p.available.complete &&
                    p.stock.value !== null &&
                    p.available.value !== null &&
                    p.stock.value > p.available.value
                  }
                />
                <Balance
                  label="Disponível"
                  total={p.available}
                  unit={p.unit}
                  available
                  at={p.availableAt}
                  minutes={15}
                />
                <small className="catalog-cost">
                  Valor estimado a custo médio:{" "}
                  {p.stockValue.complete && p.stockValue.value !== null
                    ? money(p.stockValue.value)
                    : "—"}
                </small>
              </span>
              {!p.compatible && (
                <small>
                  Unidades diferentes ou não informadas; consulte os saldos por
                  empresa.
                </small>
              )}
            </summary>
            <p className="catalog-stock-scope">
              Total dos cadastros nas empresas{" "}
              {p.companies.map((c) => companyName(c.company_id)).join(", ")}
              {p.companies.length === 1
                ? " (conforme filtro ou cadastro disponível)"
                : ""}
              .
            </p>
            {p.companies.map((c) => (
              <section className="catalog-company" key={String(c.company_id)}>
                <h4>{companyName(c.company_id)}</h4>
                {c.name !== p.name && <p>{c.name}</p>}
                {c.blocked === "Sim" && (
                  <p className="catalog-blocked">
                    Produto bloqueado no M8. Motivo não disponibilizado pela
                    API.
                  </p>
                )}
                <p>
                  <span className="catalog-reference">
                    Referência fabricante (Genuína): {c.reference || "—"}
                  </span>
                  <span className="catalog-similarity">
                    Códigos de similaridade: {c.similarity || "—"}
                  </span>
                </p>
                {matchContext && !c.fields.length && (
                  <small>
                    Saldo do mesmo ID de produto; este cadastro não contém o
                    código pesquisado.
                  </small>
                )}
                <StockValues current={c.current} />
                <PriceValues current={c.current} />
                <ProductPhotos
                  company={c.company_id}
                  id={c.product_id}
                  name={c.name}
                />
                <a
                  href={
                    "/?" +
                    new URLSearchParams({
                      company: String(c.company_id),
                      exactSerial: serial,
                      productId: c.product_id,
                      view: "materials",
                    })
                  }
                >
                  Consultar histórico deste produto
                  {serial ? " nesta série" : ""}
                </a>
              </section>
            ))}
          </details>
        );
      })}
      {products[0]?.match_total > 8 && (
        <small>
          Exibindo 8 de {products[0].match_total} produtos. Referências genuínas
          primeiro; filtre por empresa para refinar.
        </small>
      )}
    </>
  );
}
