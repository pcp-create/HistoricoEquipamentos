export const evolutionCompanies = [
  { id: "all", name: "Grupo RJ", short: "Consolidado do grupo" },
  { id: "1", name: "RJ Indústria", short: "RJ Indústria" },
  { id: "2", name: "RJ Serrana", short: "Serrana" },
  { id: "27404", name: "Criciúma Compressores", short: "Criciúma" },
];
export const monthNames = [
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
export type HistoricalYear = {
  scope: string;
  year: number;
  months: (number | null)[];
  total: number | null;
  average: number | null;
  annualOnly: boolean;
  sheet: string;
};
export type LiveMonth = {
  company: string;
  period: string;
  amount: number;
  gross?: number;
  returns?: number;
  returnCount?: number;
  count: number;
};
export type Cell = {
  amount: number | null;
  source: "system" | "spreadsheet" | "mixed" | null;
  gross?: number;
  returns?: number;
  returnCount?: number;
  count: number;
  partial?: boolean;
};
export type EvolutionYear = {
  year: number;
  months: Cell[];
  total: number | null;
  average: number | null;
  annualOnly: boolean;
};
export type EvolutionData = {
  today: string;
  updatedAt: string | null;
  sourceFile: string;
  sourceHash: string;
  warning: string | null;
  series: { company: string; years: EvolutionYear[] }[];
};
const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (values: (number | null)[]) =>
  values.some((value) => value != null)
    ? round(values.reduce<number>((total, value) => total + (value ?? 0), 0))
    : null;
export function buildEvolution(
  history: { source: string; sha256: string; records: HistoricalYear[] },
  live: LiveMonth[],
  today: string,
  updatedAt: string | null,
  warning: string | null = null,
): EvolutionData {
  const maxYear = Number(today.slice(0, 4)),
    minYear = Math.min(...history.records.map((row) => row.year));
  const staticMap = new Map(
    history.records.map((row) => [`${row.scope}:${row.year}`, row]),
  );
  const liveMap = new Map(
    live
      .filter(
        (row) =>
          /^20\d{2}-(0[1-9]|1[0-2])$/.test(row.period) &&
          row.period <= today.slice(0, 7) &&
          Number.isFinite(row.amount),
      )
      .map((row) => [`${row.company}:${row.period}`, row]),
  );
  const series = evolutionCompanies.slice(1).map((company) => ({
    company: company.id,
    years: Array.from({ length: maxYear - minYear + 1 }, (_, index) => {
      const year = minYear + index,
        historical = staticMap.get(`${company.id}:${year}`);
      const months = monthNames.map((_, month): Cell => {
        const period = `${year}-${String(month + 1).padStart(2, "0")}`;
        if (period > today.slice(0, 7))
          return { amount: null, source: null, count: 0 };
        const row = liveMap.get(`${company.id}:${period}`);
        return row
          ? {
              amount: round(row.amount),
              source: "system",
              count: row.count,
              gross: row.gross,
              returns: row.returns,
              returnCount: row.returnCount,
            }
          : {
              amount: historical?.months[month] ?? null,
              source: historical?.months[month] != null ? "spreadsheet" : null,
              count: 0,
            };
      });
      const annualOnly =
        !!historical?.annualOnly &&
        !months.some((cell) => cell.source === "system");
      const total = annualOnly
        ? historical!.total
        : sum(months.map((cell) => cell.amount));
      return {
        year,
        months,
        total,
        average: annualOnly
          ? historical!.average
          : total == null
            ? null
            : round(
                total / months.filter((cell) => cell.amount != null).length,
              ),
        annualOnly,
      };
    }),
  }));
  const consolidated = {
    company: "all",
    years: series[0].years.map((_, index) => {
      const companyYears = series.map((company) => company.years[index]),
        year = companyYears[0].year,
        historical = staticMap.get(`all:${year}`);
      const months = monthNames.map((_, month): Cell => {
        const cells = companyYears.map((row) => row.months[month]);
        if (cells.some((cell) => cell.source === "system")) {
          const present = cells.filter((cell) => cell.amount != null);
          return {
            amount: sum(present.map((cell) => cell.amount)),
            source: present.some((cell) => cell.source === "spreadsheet")
              ? "mixed"
              : "system",
            count: present.reduce((n, cell) => n + cell.count, 0),
            partial: cells.some(
              (cell, i) =>
                cell.amount == null &&
                `${year}-${String(month + 1).padStart(2, "0")}` >=
                  ["2012-01", "2019-04", "2024-07"][i],
            ),
          };
        }
        if (historical)
          return {
            amount: historical.months[month],
            source: historical.months[month] != null ? "spreadsheet" : null,
            count: 0,
          };
        return {
          amount: sum(cells.map((cell) => cell.amount)),
          source: cells.some((cell) => cell.amount != null)
            ? "spreadsheet"
            : null,
          count: 0,
        };
      });
      const annualOnly =
        !months.some((cell) => cell.amount != null) &&
        companyYears.some((row) => row.annualOnly);
      const noSystem = !months.some(
        (cell) => cell.source === "system" || cell.source === "mixed",
      );
      const total = annualOnly
        ? sum(companyYears.map((row) => row.total))
        : historical && noSystem
          ? historical.total
          : sum(months.map((cell) => cell.amount));
      return {
        year,
        months,
        total,
        average: annualOnly
          ? sum(companyYears.map((row) => row.average))
          : total == null
            ? null
            : round(
                total / months.filter((cell) => cell.amount != null).length,
              ),
        annualOnly,
      };
    }),
  };
  return {
    today,
    updatedAt,
    sourceFile: history.source,
    sourceHash: history.sha256,
    warning,
    series: [consolidated, ...series],
  };
}
export function periodTotal(row: EvolutionYear, from = 1, to = 12) {
  return row.annualOnly
    ? from === 1 && to === 12
      ? row.total
      : null
    : sum(row.months.slice(from - 1, to).map((cell) => cell.amount));
}
export function comparableGrowth(
  current: EvolutionYear,
  previous: EvolutionYear | undefined,
  from = 1,
  to = 12,
): number | null {
  if (!previous) return null;
  if (current.annualOnly || previous.annualOnly) {
    const a = periodTotal(current, from, to),
      b = periodTotal(previous, from, to);
    return a != null && b != null && b > 0 ? (a / b - 1) * 100 : null;
  }
  const indices = current.months
    .map((cell, index) =>
      cell.amount != null &&
      previous.months[index].amount != null &&
      index >= from - 1 &&
      index < to
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  if (!indices.length) return null;
  const a = sum(indices.map((index) => current.months[index].amount))!,
    b = sum(indices.map((index) => previous.months[index].amount))!;
  return b > 0 ? (a / b - 1) * 100 : null;
}

export function billingRecords(
  rows: EvolutionYear[],
  base: EvolutionYear[],
  from = 1,
  to = 12,
) {
  const maximum = (values: (number | null)[]) =>
    values.some((v) => v != null)
      ? Math.max(...values.filter((v): v is number => v != null))
      : null;
  const monthly = monthNames.map((_, i) =>
    maximum(rows.map((row) => row.months[i].amount)),
  );
  const yearly = new Map(
    rows.map((row) => [
      row.year,
      maximum(row.months.slice(from - 1, to).map((cell) => cell.amount)),
    ]),
  );
  const record = maximum(
    base.flatMap((row) => row.months.map((cell) => cell.amount)),
  );
  return (year: number, month: number, amount: number | null) => {
    if (amount == null) return [];
    const labels: string[] = [];
    if (amount === monthly[month]) labels.push("Melhor do mês");
    if (amount === yearly.get(year)) labels.push("Melhor do ano");
    if (amount === record) labels.push("Recorde da base");
    return labels;
  };
}

export function billingBreakdown(
  data: EvolutionData,
  company: string,
  year: number,
  from: number,
  to: number,
) {
  return evolutionCompanies
    .slice(1)
    .filter((c) => company === "all" || c.id === company)
    .map((company) => {
      const row = data.series
        .find((s) => s.company === company.id)
        ?.years.find((r) => r.year === year);
      const cells =
        row?.months.slice(from - 1, to).filter((c) => c.amount != null) ?? [];
      const complete =
        cells.length > 0 &&
        cells.every(
          (c) => c.source === "system" && c.gross != null && c.returns != null,
        );
      const gross = complete
        ? round(cells.reduce((n, c) => n + c.gross!, 0))
        : null;
      const returns = complete
        ? round(cells.reduce((n, c) => n + c.returns!, 0))
        : null;
      return {
        company: company.id,
        name: company.name,
        value: row ? periodTotal(row, from, to) : null,
        gross,
        returns,
        net: gross != null && returns != null ? round(gross - returns) : null,
        count: cells.reduce((n, c) => n + c.count, 0),
        returnCount: cells.reduce((n, c) => n + (c.returnCount ?? 0), 0),
        historical:
          !!row?.annualOnly || cells.some((c) => c.source !== "system"),
      };
    });
}
