"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Detail } from "@/lib/sales-projection/model";
import { billingLabels } from "@/lib/sales-projection/billing";
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function OrderBillingDialog({
  row,
  onClose,
}: {
  row: Detail | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setKinds({});
    if (row)
      for (const d of row.billing?.documents || []) {
        fetch(
          `/api/sales-projection/invoice-kind?company=${row.company}&id=${encodeURIComponent(d.id)}`,
          {
            cache: "no-store",
            signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(45000)]),
          },
        )
          .then(async (response) => {
            const data = await response.json();
            if (
              !response.ok ||
              ![
                "Peças",
                "Serviços",
                "Peças e serviços",
                "Não identificado",
              ].includes(data.kind)
            )
              throw Error();
            if (!ctrl.signal.aborted)
              setKinds((current) => ({ ...current, [d.id]: data.kind }));
          })
          .catch(() => {
            if (!ctrl.signal.aborted)
              setKinds((current) => ({ ...current, [d.id]: "Não disponível" }));
          });
      }
    return () => ctrl.abort();
  }, [row, retry]);
  useEffect(() => {
    if (row) dialog.current?.showModal();
    else dialog.current?.close();
  }, [row]);
  return (
    <dialog
      ref={dialog}
      className="cr-billing-dialog"
      aria-labelledby="billing-dialog-title"
      onClose={onClose}
    >
      <header>
        <div>
          <small>CONFERÊNCIA DE FATURAMENTO</small>
          <h2 id="billing-dialog-title">
            OS {row?.id} ·{" "}
            {row?.billing ? billingLabels[row.billing.state] : "Sem análise"}
          </h2>
        </div>
        <button
          className="button"
          aria-label="Fechar conferência"
          onClick={() => dialog.current?.close()}
        >
          <X size={18} />
        </button>
      </header>
      {row?.billing && (
        <>
          <p>{row.name}</p>
          <div className="cr-billing-amounts">
            <span>
              Total da OS<strong>{money(row.amount)}</strong>
            </span>
            <span>
              Notas válidas identificadas
              <strong>{money(row.billing.billed)}</strong>
            </span>
            <span>
              Saldo a conferir
              <strong>
                {row.billing.balance == null ? "—" : money(row.billing.balance)}
              </strong>
            </span>
          </div>
          <p className="sp-notice">{row.billing.reason}</p>
          <div className="cr-billing-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nota / ID M8</th>
                  <th>Tipo</th>
                  <th>Emissão</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Vínculo identificado</th>
                </tr>
              </thead>
              <tbody>
                {row.billing.documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.number}
                      <small>ID {d.id}</small>
                    </td>
                    <td>{kinds[d.id] || "Consultando…"}</td>
                    <td>{d.date.split("-").reverse().join("/")}</td>
                    <td>{d.status}</td>
                    <td>{money(d.amount)}</td>
                    <td>{d.link}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.values(kinds).includes("Não disponível") && (
            <p className="sp-footnote">
              Não foi possível consultar o tipo de algumas notas.{" "}
              <button
                className="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Tentar novamente
              </button>
            </p>
          )}
          <p className="sp-footnote">
            Tipo identificado pelos itens de peças e serviços da nota no M8.
            “Não identificado” indica que nenhum item ativo foi retornado.
          </p>
          {!row.billing.documents.length && (
            <p>Nenhuma nota com vínculo identificável na base integrada.</p>
          )}
          <p className="sp-footnote">
            Conferência atual da base integrada, incluindo notas de competências
            anteriores e posteriores para localizar complementos. Notas
            canceladas e excluídas não entram no valor faturado. O saldo é uma
            conferência e não altera automaticamente a projeção. Notas sem
            referência à OS ou emitidas para outro cliente precisam ser
            verificadas no ERP.
          </p>
        </>
      )}
    </dialog>
  );
}
