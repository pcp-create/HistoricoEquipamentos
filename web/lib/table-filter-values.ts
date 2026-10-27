/** Options available under every other column filter; keep this column editable. */
export function tableFilterValues<T>(
  rows: readonly T[],
  column: string,
  filters: Record<string, string[] | undefined>,
  value: (row: T, column: string) => string,
): string[] {
  const others = Object.entries(filters).filter(([key, selected]) => key !== column && selected !== undefined);
  return [...new Set(rows
    .filter(row => others.every(([key, selected]) => selected!.includes(value(row, key))))
    .map(row => value(row, column)))]
    .sort((a,b) => a.localeCompare(b, "pt-BR", {numeric:true}));
}
