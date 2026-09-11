export type IntervalEntry = {
  interval_original: string;
  interval_hours?: string | number | null;
};
export type IntervalOption = {
  value: string;
  label: string;
  count: number;
  hours: number | null;
  kind: "hours" | "conditional" | "unspecified" | "review";
};
const hoursLabel = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(n);
export function intervalInfo(
  entry: IntervalEntry,
): Omit<IntervalOption, "count"> {
  const raw = (entry.interval_original || "").trim();
  if (!raw)
    return {
      value: "unspecified",
      label: "Sem intervalo informado",
      hours: null,
      kind: "unspecified",
    };
  const hours =
    entry.interval_hours == null ? NaN : Number(entry.interval_hours);
  // Reject apparent misplaced part numbers as automatic maintenance periods; keep the original selectable for review.
  if (Number.isFinite(hours) && hours > 0 && hours <= 100000)
    return {
      value: `h:${hours}`,
      label: `${hoursLabel(hours)} h`,
      hours,
      kind: "hours",
    };
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
  if (
    /^\d+\s*\/\s*\d+$/.test(raw) &&
    raw.split("/").every((n) => Number(n) > 0 && Number(n) <= 100000)
  )
    return {
      value: `text:${key}`,
      label:
        raw
          .split("/")
          .map((n) => hoursLabel(Number(n)))
          .join(" / ") + " h · Conferir condições",
      hours: null,
      kind: "conditional",
    };
  return {
    value: `text:${key}`,
    label: `${raw} · Conferir na planilha`,
    hours: null,
    kind: "review",
  };
}
export function intervalOptions(entries: IntervalEntry[]): IntervalOption[] {
  const options = new Map<string, IntervalOption>();
  for (const e of entries) {
    const info = intervalInfo(e),
      old = options.get(info.value);
    if (old) old.count++;
    else options.set(info.value, { ...info, count: 1 });
  }
  for (const e of entries) {
    if (intervalInfo(e).kind !== "conditional") continue;
    for (const hours of e.interval_original.split("/").map(Number)) {
      const value = `h:${hours}`;
      if (!options.has(value))
        options.set(value, {
          value,
          label: `${hoursLabel(hours)} h`,
          hours,
          kind: "hours",
          count: 0,
        });
    }
  }
  for (const option of options.values()) {
    option.count = entries.filter((e) =>
      matchesInterval(e, option.value),
    ).length;
  }
  return [...options.values()].sort((a, b) => {
    const rank = { hours: 0, conditional: 1, review: 2, unspecified: 3 };
    return (
      rank[a.kind] - rank[b.kind] ||
      (a.hours !== null && b.hours !== null
        ? a.hours - b.hours
        : a.label.localeCompare(b.label, "pt-BR"))
    );
  });
}
export function matchesInterval(entry: IntervalEntry, selected: string) {
  if (!selected) return true;
  const info = intervalInfo(entry);
  if (!selected.startsWith("h:")) return info.value === selected;
  const revision = Number(selected.slice(2));
  if (!Number.isFinite(revision) || revision <= 0 || revision > 100000)
    return false;
  const periods =
    info.kind === "hours"
      ? [info.hours!]
      : info.kind === "conditional"
        ? entry.interval_original.split("/").map(Number)
        : [];
  return periods.some(
    (period) => revision >= period && Number.isInteger(revision / period),
  );
}
