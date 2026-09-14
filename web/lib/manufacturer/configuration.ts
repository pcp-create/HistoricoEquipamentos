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
export const additionalCatalogFields = [
  ["internalCode", "Código M8"],
  ["quantity", "Quantidade"],
  ["drawingCode", "Código da vista"],
  ["saleFactor", "Percentual venda (médio) — valor da lista"],
  ["conditions", "Condições de aplicação da versão"],
] as const;
export type CatalogRecord = Record<(typeof catalogFields)[number][0], string> &
  Partial<
    Record<
      | (typeof additionalCatalogFields)[number][0]
      | "modelOnly"
      | "intervalUnknown",
      string
    >
  >;
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
    for (const key of [
      ...additionalCatalogFields.map(([k]) => k),
      "modelOnly",
      "intervalUnknown",
    ] as const) {
      const raw = value && typeof value === "object" ? value[key] : undefined;
      if (
        raw !== undefined &&
        (typeof raw !== "string" ||
          raw.length > (key === "conditions" ? 2000 : 300))
      )
        errors.push(
          `Linha ${index + 2}: campo adicional inválido ou acima do limite.`,
        );
      row[key] = typeof raw === "string" ? raw.trim() : "";
    }
    if (row.internalCode && !/^[1-9]\d{0,18}$/.test(row.internalCode))
      errors.push(`Linha ${index + 2}: código M8 inválido.`);
    for (const key of ["quantity", "saleFactor"] as const) {
      const raw = row[key];
      if (
        raw &&
        (!/^\d+(?:[.,]\d{1,6})?$/.test(raw) ||
          !Number.isFinite(Number(raw.replace(",", "."))) ||
          Number(raw.replace(",", ".")) <= 0)
      )
        errors.push(
          `Linha ${index + 2}: ${key === "quantity" ? "quantidade" : "percentual"} deve ser um número positivo.`,
        );
    }
    if (
      !["", "Sim"].includes(row.modelOnly || "") ||
      !["", "Sim"].includes(row.intervalUnknown || "")
    )
      errors.push(`Linha ${index + 2}: opção inválida.`);
    for (const [key, label, required] of catalogFields) {
      const raw = value && typeof value === "object" ? value[key] : undefined;
      row[key] = typeof raw === "string" ? raw.trim() : "";
      if (
        (required &&
          !row[key] &&
          !(key === "reference" && row.internalCode) &&
          !(key === "interval" && row.intervalUnknown === "Sim")) ||
        row[key].length > (key === "observation" ? 2000 : 300)
      )
        errors.push(
          `Linha ${index + 2}: ${label} obrigatório ou acima do limite de texto.`,
        );
    }
    if (row.reference && !validCode(normalizeCode(row.reference)))
      errors.push(
        `Linha ${index + 2}: referência deve conter de 6 a 24 letras/dígitos, com pelo menos um número. Informe uma referência por item.`,
      );
    if (
      row.intervalUnknown !== "Sim" &&
      (!/^\d+$/.test(row.interval) ||
        Number(row.interval) < 1 ||
        Number(row.interval) > 100000)
    )
      errors.push(
        `Linha ${index + 2}: intervalo deve ser um número inteiro entre 1 e 100000 horas.`,
      );
    if (row.serial && serialMatch(row.serial, "ZZZ000000") === "review")
      errors.push(
        `Linha ${index + 2}: faixa de série não reconhecida. Use BQD100000 ... ou DE BQD100000 ATÉ BQD199999, por exemplo.`,
      );
    if (row.modelOnly === "Sim" && row.serial)
      errors.push(
        `Linha ${index + 2}: aplicação somente por modelo não deve conter faixa de série.`,
      );
    if (row.intervalUnknown === "Sim" && row.interval)
      errors.push(
        `Linha ${index + 2}: remova o intervalo ou desmarque não informado.`,
      );
    records.push(row);
  });
  // A version represents a single model and serial applicability.
  const versions = new Map<string, string>();
  records.forEach((r, i) => {
    const key = fold([r.manufacturer, r.model, r.version].join("|"));
    const previous = versions.get(key);
    if (
      previous !== undefined &&
      previous !== fold(JSON.stringify([r.serial, r.modelOnly, r.conditions]))
    )
      errors.push(
        `Linha ${i + 2}: a mesma versão tem faixas de série diferentes. Use nomes de versão distintos.`,
      );
    versions.set(
      key,
      fold(JSON.stringify([r.serial, r.modelOnly, r.conditions])),
    );
  });
  return { records, errors };
}
