"use client";
import { useSearchParams } from "next/navigation";
import { companyName } from "@/lib/company-names";
import MaterialPhoto from "./material-photo";
import QuoteOrderLink from "./quote-order-link";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
type Row = {
  details?: Record<string, unknown>;
  last_purchase_cost?: string | null;
  last_purchase_at?: string | null;
  purchase_establishment?: string | null;
  last_sale_at?: string | null;
  last_order_id?: string | null;
  last_order_number?: string | null;
  company_id: number;
  product_id: string;
  name: string;
  reference: string | null;
  unit: string | null;
  average_cost: string | null;
  minimum_price: string | null;
  sale_price: string | null;
  stock: string | null;
  available: string | null;
  stock_value: string | null;
  cost_at: string | null;
  price_at: string | null;
  stock_at: string | null;
  available_at: string | null;
};
const number = (v: string | number | null, money = false) =>
  v == null || !Number.isFinite(Number(v))
    ? "A consultar"
    : Number(v).toLocaleString(
        "pt-BR",
        money
          ? { style: "currency", currency: "BRL" }
          : { maximumFractionDigits: 3 },
      );
const date = (v: string | null) =>
  v && Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Sem coleta";
export default function MaterialLookup() {
  const searchParams = useSearchParams();
  const linkedCode = searchParams.get("code") || "";
  const [code, setCode] = useState("");
  const [request, setRequest] = useState<{ code?: string; q?: string } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [matches, setMatches] = useState<{ products: (Row & { manufacturer?: string })[]; total: number } | null>(null);
  const [similar, setSimilar] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (/^[1-9]\d{0,17}$/.test(linkedCode)) {
      setCode(linkedCode);
      setRequest({ code: linkedCode });
    }
  }, [linkedCode]);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setRows(null);
    setMatches(null);
    setSimilar([]);
    fetch(
      "/api/products/lookup?" + new URLSearchParams(request.code ? { code: request.code } : { q: request.q || "" }),
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (body.products) { setMatches(body); return; }
        setRows(body.rows);
        setSimilar(body.similar || []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [request]);
  const productDetails = rows?.find(row => Number(row.company_id) === 1)?.details;
  return (
    <section
      className="manual-card material-lookup"
      aria-label="Consulta de produtos"
    >
      <div className="material-lookup-top">
        <div className="material-lookup-search">
          <h2>Consultar produtos</h2>
          <p>
            Preços, custo médio e saldos da última coleta, inclusive para
            materiais sem histórico de consumo.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setRequest({ q: code.trim() });
            }}
            className="quote-toolbar"
          >
            <label>
              Pesquisar produto
              <input
                maxLength={200}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código, descrição, referência, fabricante ou outro dado"
              />
            </label>
            <button className="primary" disabled={busy}>
              <Search size={16} />
              {busy ? "Consultando…" : "Consultar material"}
            </button>
          </form>
        </div>
        {!!rows?.length && (
          <MaterialPhoto
            key={rows[0].product_id}
            id={rows[0].product_id}
            name={rows[0].name}
            companies={rows.map((r) => r.company_id)}
          />
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {matches && (
        <div>
          <p>{matches.total} produto(s) encontrado(s).{matches.total > matches.products.length && " Exibindo os primeiros 100; refine a pesquisa."}</p>
          <div className="manual-table-scroll">
            <table className="manual-table">
              <thead><tr><th>Código</th><th>Produto</th><th>Referência fabricante</th><th>Fabricante</th><th>Ação</th></tr></thead>
              <tbody>{matches.products.map(product => (
                <tr key={product.product_id}>
                  <td>{product.product_id}</td><td>{product.name}</td><td>{product.reference || "—"}</td><td>{product.manufacturer || "—"}</td>
                  <td><button type="button" className="product-consult-button" onClick={() => { setCode(product.product_id); setRequest({ code: product.product_id }); }}><Search size={15} aria-hidden="true" />Consultar produto</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {rows?.length === 0 && (
        <p>Nenhum material encontrado para esse código.</p>
      )}
      {!!rows?.length && (
        <>
          <div className="material-lookup-heading">
            <h3>
              {rows[0].name} · Cód. {rows[0].product_id}
            </h3>
          </div>
          <div className="manual-table-scroll">
            <table className="manual-table material-lookup-table">
              <colgroup>
                <col style={{ width: "20%" }} />
                {Array.from({ length: 7 }, (_, i) => (
                  <col key={i} style={{ width: "9.4%" }} />
                ))}
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Empresa / referência</th>
                  <th>Custo médio unitário</th>
                  <th>Custo da última compra</th>
                  <th>Venda mínima</th>
                  <th>Preço de venda</th>
                  <th>Estoque</th>
                  <th>Disponível</th>
                  <th>Valor do estoque</th>
                  <th>Última venda / OS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.company_id}>
                    <td>
                      {companyName(row.company_id)}
                      <small>
                        Ref. fabricante: {row.reference || "Não informada"}
                      </small>
                      <small>Unidade: {row.unit || "Não informada"}</small>
                    </td>
                    <td>
                      {number(row.average_cost, true)}
                      <small className="material-collected">
                        {date(row.cost_at)}
                      </small>
                    </td>
                    <td>
                      {number(row.last_purchase_cost ?? null, true)}
                      <small className="material-collected">{row.last_purchase_at ? date(row.last_purchase_at) : "Compra não informada"}</small>
                      {row.purchase_establishment && <small>{row.purchase_establishment}</small>}
                    </td>
                    <td>
                      {number(row.minimum_price, true)}
                      <small className="material-collected">
                        {date(row.price_at)}
                      </small>
                    </td>
                    <td>
                      {number(row.sale_price, true)}
                      <small className="material-collected">
                        {date(row.price_at)}
                      </small>
                    </td>
                    <td>
                      {number(row.stock)}
                      <small className="material-collected">
                        {date(row.stock_at)}
                      </small>
                    </td>
                    <td>
                      {number(row.available)}
                      <small className="material-collected">
                        {date(row.available_at)}
                      </small>
                    </td>
                    <td>{number(row.stock_value, true)}</td>
                    <td>
                      {row.last_order_id ? (
                        <>
                          <span>
                            {row.last_sale_at
                              ? new Date(row.last_sale_at).toLocaleDateString(
                                  "pt-BR",
                                  { timeZone: "America/Sao_Paulo" },
                                )
                              : "Data não informada"}
                          </span>
                          <small>
                            <QuoteOrderLink
                              sale={{
                                company: String(row.company_id),
                                order: row.last_order_id,
                                orderNumber:
                                  row.last_order_number || row.last_order_id,
                                date: row.last_sale_at || "",
                                quantity: "",
                                unitPrice: "",
                                total: "",
                              }}
                            />
                          </small>
                        </>
                      ) : (
                        "Sem venda registrada"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="product-full-details">
            <summary>Informações completas do produto</summary>
            <p>Cadastro base: RJ Industria.</p>
            {productDetails ? (
              <dl className="product-details-grid">
                {Object.entries(productDetails).map(([key, value]) => (
                  <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase())}</dt>
                  <dd>{value == null || value === "" ? "Não informado" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>
                ))}
              </dl>
            ) : <p>Informações complementares ainda não disponíveis no cadastro da RJ Industria.</p>}
          </details>
          <h3>Produtos similares</h3>
          <p>Relacionados pelas referências e códigos de similaridade cadastrados. Confira a aplicação antes de substituir.</p>
          {!similar.length ? <p>Nenhum similar identificado na base.</p> : (
            <div className="manual-table-scroll">
              <table className="manual-table">
                <thead><tr><th>Produto / referência</th><th>Empresa</th><th>Unidade</th><th>Estoque</th><th>Disponível</th></tr></thead>
                <tbody>{similar.map(item => (
                  <tr key={item.product_id + ":" + item.company_id}>
                    <td><a className="quote-order-link" href={"/analise-materiais?code=" + item.product_id}>Cód. {item.product_id}</a> · {item.name}<small>Ref. fabricante: {item.reference || "Não informada"}</small></td>
                    <td>{companyName(item.company_id)}</td><td>{item.unit || "—"}</td>
                    <td>{number(item.stock)}<small className="material-collected">{date(item.stock_at)}</small></td>
                    <td>{number(item.available)}<small className="material-collected">{date(item.available_at)}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p>
            Última compra: custo do estabelecimento com a compra mais recente registrada na empresa.
            Custo médio atual por empresa, ponderado pelos saldos quando há
            custos diferentes entre estabelecimentos. Valores ausentes não são
            considerados zero. Última venda: OS processada e com coleta
            concluída nesta empresa, excluindo materiais removidos. Datas em
            horário de Brasília.
          </p>
        </>
      )}
    </section>
  );
}
