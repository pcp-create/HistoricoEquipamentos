"use client";
import { useEffect, useState } from "react";
import { isNotApproved } from "@/lib/material-approval";
import { orderTotals } from "@/lib/order-totals";
import WorkshopValue, { workshopMoney } from "./workshop-value";
const money = (v: unknown) =>
  v == null || String(v).trim() === "" || !Number.isFinite(Number(v))
    ? "Não informado"
    : workshopMoney(Number(v));
const quantity = (v: unknown) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
export default function WorkshopFinancialDetails({
  visitId,
}: {
  visitId: string;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [tab, setTab] = useState("products");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    fetch("/api/workshop?financial=" + encodeURIComponent(visitId), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok)
          throw Error(b.error || "Não foi possível consultar os valores.");
        return b;
      })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [visitId, retry]);
  return (
    <section
      className="ws-detail-block ws-item-values"
      aria-label="Produtos e serviços das OSs"
    >
      <h3>Produtos e serviços das OSs abertas</h3>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : !data ? (
        <p role="status">Carregando produtos e serviços…</p>
      ) : (
        <>
          <WorkshopValue financial={data.financial} />
          <p>
            Somente OSs abertas de Cobrança e Custo vinculadas ao equipamento.
            Os valores dos itens são os registrados no M8. Itens excluídos ou
            reprovados aparecem identificados e não entram nos subtotais.
          </p>
          {!!data.financial.quotes?.length && (
            <div className="ws-open-quotes">
              <h4>Orçamentos M8 em aberto</h4>
              {data.financial.quotes.map((q: any) => (
                <a
                  key={q.company + ":" + q.id}
                  href={
                    "/orcamentos?number=" +
                    encodeURIComponent(q.number) +
                    "&company=" +
                    q.company
                  }
                >
                  <span>
                    {q.number} · Empresa {q.company}
                  </span>
                  <b>{money(q.amount)}</b>
                </a>
              ))}
            </div>
          )}
          <div
            className="ws-item-tabs"
            role="tablist"
            aria-label="Itens das OSs"
          >
            {[
              ["products", "Produtos"],
              ["services", "Serviços"],
            ].map(([id, label]) => (
              <button
                key={id}
                id={"ws-items-" + id}
                role="tab"
                aria-selected={tab === id}
                aria-controls="ws-items-panel"
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id="ws-items-panel"
            role="tabpanel"
            aria-labelledby={"ws-items-" + tab}
          >
            {data.orders.map((order: any) => {
              const items = order[tab] || [];
              const mapped = (rows: any[]) =>
                rows.map((item) => ({
                  valor_total: item.amount,
                  esta_excluido: item.excluded,
                  aprovado: item.approval,
                }));
              const totals = orderTotals(
                mapped(order.products),
                mapped(order.services),
                order.amount,
                !!order.detailAt,
              );
              return (
                <article
                  className="ws-order-items"
                  key={order.company + ":" + order.id}
                >
                  <h4>
                    <a
                      href={`/historico?createdCompany=${order.company}&createdOrder=${order.id}`}
                    >
                      OS {order.number} · Empresa {order.company}
                    </a>
                  </h4>
                  <p>
                    {order.situation} · {order.status}
                  </p>
                  {!order.detailAt && (
                    <p className="ws-warning">
                      Detalhamento ainda não sincronizado. A relação de itens
                      pode estar incompleta.
                    </p>
                  )}
                  <div className="ws-item-totals">
                    <span>
                      Produtos<strong>{money(totals.materials)}</strong>
                    </span>
                    <span>
                      Serviços<strong>{money(totals.services)}</strong>
                    </span>
                    <span>
                      Total da OS<strong>{money(order.amount)}</strong>
                    </span>
                  </div>
                  {totals.difference !== null &&
                    Math.abs(totals.difference) > 0.009 && (
                      <p>
                        Diferença entre o total da OS e os itens:{" "}
                        {money(totals.difference)}. O indicador considera o
                        total da OS informado pelo M8.
                      </p>
                    )}
                  <div className="ws-item-table">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            {tab === "products"
                              ? "Produto / referência"
                              : "Serviço"}
                          </th>
                          <th>Quantidade</th>
                          <th>Valor unitário</th>
                          <th>Valor total</th>
                          <th>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any) => (
                          <tr
                            key={item.id}
                            className={
                              item.excluded
                                ? "ws-item-excluded"
                                : isNotApproved(item.approval)
                                  ? "ws-item-rejected"
                                  : ""
                            }
                          >
                            <td>
                              {item.name || "Sem descrição"}
                              {item.reference && (
                                <small>{item.reference}</small>
                              )}
                            </td>
                            <td>
                              {quantity(item.quantity)} {item.unit || ""}
                            </td>
                            <td>{money(item.unit_price)}</td>
                            <td>{money(item.amount)}</td>
                            <td>
                              {item.excluded
                                ? "Excluído"
                                : isNotApproved(item.approval)
                                  ? "Reprovado"
                                  : "Ativo"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!items.length && (
                      <p>
                        {order.detailAt
                          ? "Nenhum item nesta aba."
                          : "Nenhum item sincronizado nesta aba."}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
            {!data.orders.length && (
              <p>Nenhuma OS elegível vinculada ao equipamento.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
