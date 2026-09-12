"use client";
import { companyName } from "@/lib/company-names";
import MaterialPhoto from "./material-photo";
import QuoteOrderLink from "./quote-order-link";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
type Row = {
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
  const [code, setCode] = useState("");
  const [request, setRequest] = useState<{ code: string } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setRows(null);
    fetch(
      "/api/products/lookup?" + new URLSearchParams({ code: request.code }),
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setRows(body.rows);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [request]);
  return (
    <section
      className="manual-card material-lookup"
      aria-label="Consulta por código do material"
    >
      <div className="material-lookup-top">
        <div className="material-lookup-search">
          <h2>Consultar material por código</h2>
          <p>
            Preços, custo médio e saldos da última coleta, inclusive para
            materiais sem histórico de consumo.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setRequest({ code: code.trim() });
            }}
            className="quote-toolbar"
          >
            <label>
              Código do material
              <input
                inputMode="numeric"
                pattern="[1-9][0-9]{0,17}"
                maxLength={18}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex.: 20119"
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
                {Array.from({ length: 6 }, (_, i) => (
                  <col key={i} style={{ width: "11%" }} />
                ))}
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Empresa / referência</th>
                  <th>Custo médio unitário</th>
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
          <p>
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
