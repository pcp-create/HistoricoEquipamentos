const names: Record<string, string> = {
  "1": "RJ Industria",
  "2": "Serrana",
  "27404": "Criciúma",
};
export function companyName(value: unknown): string {
  const id = String(value ?? "").trim();
  return names[id] || (id ? `Empresa ${id}` : "Empresa não informada");
}
export function companyNamesInText(value: string): string {
  return value.replace(/\bempresa\s+(27404|1|2)\b/gi, (_, id: string) =>
    companyName(id),
  );
}
