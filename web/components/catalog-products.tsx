import {
  groupedProducts,
  type CatalogProduct,
} from "@/lib/manufacturer/products";
import { StockValues, PriceValues } from "./product-values";
import ProductPhotos from "./product-photos";
const quantity = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(n);
function Balance({
  label,
  total,
  unit,
}: {
  label: string;
  total: { value: number | null; complete: boolean };
  unit: string;
}) {
  const state = !total.complete
    ? "unknown"
    : total.value! > 0
      ? "positive"
      : "zero";
  return (
    <span className={`catalog-balance ${state}`}>
      <span>
        {label}
        {!total.complete && total.value !== null ? " conhecido" : ""}
      </span>
      <b>
        {total.value === null
          ? "A consultar"
          : `${quantity(total.value)} ${unit}`}
      </b>
      {!total.complete && <em>Saldo incompleto</em>}
    </span>
  );
}
export default function CatalogProducts({
  products,
  serial,
}: {
  products: CatalogProduct[];
  serial: string;
}) {
  const groups = groupedProducts(products);
  return (
    <>
      {groups.map((p) => {
        const stale = p.companies.some(
          (c) =>
            !c.current?.stock_at ||
            !c.current?.available_at ||
            !Number.isFinite(Date.parse(c.current.stock_at)) ||
            !Number.isFinite(Date.parse(c.current.available_at)) ||
            Date.now() - Date.parse(c.current.stock_at) > 120 * 60000 ||
            Date.now() - Date.parse(c.current.available_at) > 15 * 60000,
        );
        return (
          <details className="manual-product" key={p.id}>
            <summary>
              <strong>{p.name || `Produto ${p.id}`}</strong>
              <small>
                ID {p.id} · {p.companies.length}{" "}
                {p.companies.length === 1 ? "empresa" : "empresas"}
              </small>
              {p.fields.includes("referenciaFabricante") && (
                <small className="catalog-genuine">
                  Referência fabricante (Genuína)
                </small>
              )}
              {p.fields.includes("codigoSimilaridade") && (
                <small>Código de similaridade</small>
              )}
              <span className="catalog-stock-summary">
                <Balance label="Estoque total" total={p.stock} unit={p.unit} />
                <Balance label="Disponível" total={p.available} unit={p.unit} />
              </span>
              {!p.compatible && (
                <small>
                  Unidades diferentes ou não informadas; consulte os saldos por
                  empresa.
                </small>
              )}
              {stale && (
                <small className="catalog-stale">
                  Há saldos sem coleta recente. Confira as datas nos detalhes.
                </small>
              )}
            </summary>
            <p className="catalog-stock-scope">
              Total dos cadastros nas empresas{" "}
              {p.companies.map((c) => c.company_id).join(", ")}
              {p.companies.length === 1
                ? " (conforme filtro ou cadastro disponível)"
                : ""}
              .
            </p>
            {p.companies.map((c) => (
              <section className="catalog-company" key={String(c.company_id)}>
                <h4>Empresa {c.company_id}</h4>
                {c.name !== p.name && <p>{c.name}</p>}
                <p>
                  <span className="catalog-reference">
                    Referência fabricante (Genuína): {c.reference || "—"}
                  </span>
                  <span className="catalog-similarity">
                    Códigos de similaridade: {c.similarity || "—"}
                  </span>
                </p>
                {!c.fields.length && (
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
