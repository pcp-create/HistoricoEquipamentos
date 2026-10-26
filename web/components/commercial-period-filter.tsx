"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

const months = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export default function CommercialPeriodFilter({
  period,
  company,
  onPeriodChange,
  onCompanyChange,
  companies,
}: {
  period: string;
  company: string;
  onPeriodChange: (value: string) => void;
  onCompanyChange: (value: string) => void;
  companies: readonly { company: number; name: string }[];
}) {
  return (
    <section className="sp-period" aria-label="Período e empresa">
      <div className="sp-year">
        <button
          aria-label="Ano anterior"
          disabled={Number(period.slice(0, 4)) <= 2000}
          onClick={() =>
            onPeriodChange(Number(period.slice(0, 4)) - 1 + period.slice(4))
          }
        >
          <ChevronLeft size={16} />
        </button>
        <strong>{period.slice(0, 4)}</strong>
        <button
          aria-label="Próximo ano"
          disabled={Number(period.slice(0, 4)) >= 2099}
          onClick={() =>
            onPeriodChange(Number(period.slice(0, 4)) + 1 + period.slice(4))
          }
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="sp-months" role="group" aria-label="Mês">
        {months.map((m, i) => (
          <button
            key={m}
            aria-pressed={Number(period.slice(5)) === i + 1}
            onClick={() =>
              onPeriodChange(
                period.slice(0, 4) + "-" + String(i + 1).padStart(2, "0"),
              )
            }
          >
            {m}
          </button>
        ))}
      </div>
      <select
        aria-label="Empresa"
        value={company}
        onChange={(e) => onCompanyChange(e.target.value)}
      >
        <option value="all">Todas as empresas</option>
        {companies.map((r) => (
          <option key={r.company} value={r.company}>
            {r.name}
          </option>
        ))}
      </select>
    </section>
  );
}
