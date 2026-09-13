import { fold, normalizeCode, validCode, serialMatch } from "./rules";
export const catalogFields = [
  ["manufacturer", "Fabricante", true],
  ["model", "Modelo", true],
  ["version", "Versão", true],
  ["serial", "Faixa de série", false],
  ["section", "Grupo", true],
  ["description", "Descrição da peça", true],
  ["reference", "Referência genuína", true],
  ["interval", "Intervalo em horas", true],
  ["observation", "Observações", false],
] as const;
export type CatalogRecord = Record<(typeof catalogFields)[number][0], string>;
export const blankCatalogRecord = (): CatalogRecord =>
  Object.fromEntries(catalogFields.map(([key]) => [key, ""])) as CatalogRecord;
export function validateCatalogRecords(input: unknown) {
  const errors: string[] = [],
    records: CatalogRecord[] = [];
  if (!Array.isArray(input) || !input.length || input.length > 1000)
    return {
      records,
      errors: ["Informe entre 1 e 1.000 itens por importação."],
    };
  input.forEach((value, index) => {
    const row = blankCatalogRecord();
    for (const [key, label, required] of catalogFields) {
      const raw = value && typeof value === "object" ? value[key] : undefined;
      row[key] = typeof raw === "string" ? raw.trim() : "";
      if (
        (required && !row[key]) ||
        row[key].length > (key === "observation" ? 2000 : 300)
      )
        errors.push(
          `Linha ${index + 2}: ${label} obrigatório ou acima do limite de texto.`,
        );
    }
    if (!validCode(normalizeCode(row.reference)))
      errors.push(
        `Linha ${index + 2}: referência deve conter de 6 a 24 letras/dígitos, com pelo menos um número. Informe uma referência por item.`,
      );
    if (
      !/^\d+$/.test(row.interval) ||
      Number(row.interval) < 1 ||
      Number(row.interval) > 100000
    )
      errors.push(
        `Linha ${index + 2}: intervalo deve ser um número inteiro entre 1 e 100000 horas.`,
      );
    if (row.serial && serialMatch(row.serial, "ZZZ000000") === "review")
      errors.push(
        `Linha ${index + 2}: faixa de série não reconhecida. Use BQD100000 ... ou DE BQD100000 ATÉ BQD199999, por exemplo.`,
      );
    records.push(row);
  });
  // A version represents a single model and serial applicability.
  const versions = new Map<string, string>();
  records.forEach((r, i) => {
    const key = fold([r.manufacturer, r.model, r.version].join("|"));
    const previous = versions.get(key);
    if (previous !== undefined && previous !== fold(r.serial))
      errors.push(
        `Linha ${i + 2}: a mesma versão tem faixas de série diferentes. Use nomes de versão distintos.`,
      );
    versions.set(key, fold(r.serial));
  });
  return { records, errors };
}
