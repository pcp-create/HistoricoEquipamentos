import { brazilToday, validDate } from "./planning";

export function rentalContract(
  start: string | null,
  end: string | null,
  today = brazilToday(),
) {
  const days = (a: string, b: string) =>
    Math.round(
      (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
    );
  const valid =
    validDate(start) && validDate(end) && end >= start && validDate(today);
  const remaining = valid ? days(today, end) : null;
  return {
    start,
    end,
    duration: valid ? days(start, end) : null,
    remaining,
    key:
      remaining == null
        ? "incomplete"
        : remaining < 0
          ? "overdue"
          : remaining < 30
            ? "soon"
            : "current",
    label:
      remaining == null
        ? "Conferir datas do contrato"
        : remaining < 0
          ? "Vencido"
          : remaining < 30
            ? "Próximo do vencimento"
            : "Dentro do prazo",
  };
}
