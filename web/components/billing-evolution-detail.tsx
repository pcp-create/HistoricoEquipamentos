"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import {
  billingBreakdown,
  evolutionCompanies,
  monthNames,
  type EvolutionData,
} from "@/lib/billing-evolution/model";
const money = (value: number | null) =>
  value == null
    ? "—"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function BillingEvolutionDetail({
  data,
  company,
  selection,
  onClose,
}: {
  data: EvolutionData;
  company: string;
  selection: { year: number; from: number; to: number; value: number };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const rows = billingBreakdown(
    data,
    company,
    selection.year,
    selection.from,
    selection.to,
  );
  const present = rows.filter((row) => row.value != null);
  const complete =
    present.length > 0 && present.every((row) => row.net != null);
  const sum = (key: "gross" | "returns" | "net") =>
    complete
      ? Math.round(present.reduce((n, row) => n + row[key]!, 0) * 100) / 100
      : null;
  const historical = present.some((row) => row.historical);
  return (
    <dialog
      className="be-detail"
      ref={ref}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="be-detail-title"
    >
      <header>
        <div>
          <h2 id="be-detail-title">Detalhamento do faturamento</h2>
          <p>
            {evolutionCompanies.find((c) => c.id === company)?.name} ·{" "}
            {selection.from === selection.to
              ? monthNames[selection.from - 1]
              : `${monthNames[selection.from - 1]} a ${monthNames[selection.to - 1]}`}{" "}
            / {selection.year}
          </p>
        </div>
        <button
          type="button"
          aria-label="Fechar detalhamento"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <p className="be-detail-value">
        Valor na evolução: <strong>{money(selection.value)}</strong>
      </p>
      <p>
        Faturamento líquido = faturamento total − devoluções. Valores pela data
        de emissão dos documentos processados.
      </p>
      <div className="be-detail-table">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Faturamento total</th>
              <th>Devoluções</th>
              <th>Faturamento líquido</th>
              <th>Valor na evolução</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.company}>
                <th scope="row">
                  {row.name}
                  <small>
                    {row.value == null
                      ? "Sem histórico no período"
                      : row.historical
                        ? "Histórico da planilha · composição indisponível"
                        : `${row.count} notas · ${row.returnCount} devoluções`}
                  </small>
                </th>
                <td>{money(row.gross)}</td>
                <td>{money(row.returns)}</td>
                <td>{money(row.net)}</td>
                <td>{money(row.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total com composição completa</th>
              <td>{money(sum("gross"))}</td>
              <td>{money(sum("returns"))}</td>
              <td>{money(sum("net"))}</td>
              <td>{money(selection.value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {historical && (
        <p className="be-warning">
          A planilha informa apenas o valor histórico, sem separar faturamento
          total e devoluções. Essa composição não foi estimada. O consolidado
          original também pode ter cobertura diferente da soma das empresas.
        </p>
      )}
      {data.warning && <p className="be-warning">{data.warning}</p>}
      <p className="be-detail-footnote">
        “—” significa composição não disponível. Não significa zero. Nos
        períodos integrados, os valores líquidos substituem o histórico do mesmo
        mês.
      </p>
      <footer>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </footer>
    </dialog>
  );
}
