import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { normalizeCode, validCode } from "./rules";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function parseRjPreventive(bytes: Buffer, filename: string) {
  const book = XLSX.read(bytes, { type: "buffer" }),
    digest = hash(bytes),
    revision = "rj-preventive:" + digest;
  const models = book.SheetNames.filter((name) => name !== "Preços");
  const family = filename.includes("Linha DD")
    ? "DD"
    : filename.includes("Linha TPF")
      ? "TPF"
      : filename.includes("Linha ROTOR")
        ? "ROTOR"
        : null;
  const expected =
    family === "DD"
      ? [
          "TPF50DD",
          "TPF60DD",
          "TPF75DD",
          "TPF100DD",
          "TPF125DD",
          "TPF150DD",
          "TPF200DD",
          "TPF250DD",
        ]
      : family === "TPF"
        ? ["TPF_15", "TPF_25", "TPF_30", "TPF_40"]
        : ["ROTOR 10"];
  if (!family || JSON.stringify(models) !== JSON.stringify(expected))
    throw Error("Abas/modelos diferentes do padrão conferido: " + filename);
  const variants: any[] = [],
    entries: any[] = [],
    formatted: any[] = [],
    warnings: string[] = [];
  const priceDate = String(
    book.Sheets["Preços"]?.B2?.w ||
      book.Sheets["Preços"]?.B2?.v ||
      "não informada",
  );
  let sourceRows = 0;
  for (const sheet of models) {
    const s = book.Sheets[sheet],
      bounds = XLSX.utils.decode_range(s["!ref"]!);
    const cell = (row: number, col: number) =>
      s[XLSX.utils.encode_cell({ r: row - 1, c: col })];
    const text = (row: number, col: number) => {
      const c = cell(row, col);
      if (c?.t === "e")
        throw Error(
          `Célula com erro: ${sheet}!${XLSX.utils.encode_cell({ r: row - 1, c: col })}`,
        );
      return String(c?.w ?? c?.v ?? "").trim();
    };
    if (
      text(4, 0) !== "COMPONENTE" ||
      !text(4, 1).includes("METALPLAN") ||
      text(4, 3) !== "QTD"
    )
      throw Error("Cabeçalho não reconhecido: " + sheet);
    const columns: { column: number; hours: number[]; original: string }[] = [];
    for (let col = 4; col <= bounds.e.c; col += 2) {
      const raw = String(cell(4, col)?.v ?? "").trim();
      if (!/^[\d\s,e]+$/.test(raw))
        throw Error("Cabeçalho de revisão inválido: " + sheet);
      const hours = (raw.match(/\d+/g) || []).map(Number);
      if (!hours.length || hours.some((n) => n < 1 || n > 100000))
        throw Error("Horas fora do limite: " + sheet);
      columns.push({ column: col, hours, original: raw });
    }
    const model = sheet.replace("_", ""),
      variantId = hash(revision + ":" + model);
    const footer =
      Array.from({ length: bounds.e.r + 1 }, (_, i) => text(i + 1, 0)).find(
        (t) => t.startsWith("Obs.:"),
      ) || "";
    const aliases = model.startsWith("TPF")
      ? model.replace(
          /^TPF(\d+)(DD)?$/,
          (_, n, dd) => `TPF ${n}${dd ? " DD" : ""}`,
        )
      : model.replace(" ", "");
    const conditions =
      "Padrão interno RJ para equipamentos Metalplan. Aplicação por modelo, respeitando as condições de cada item. As marcações X indicam revisões específicas, sem extrapolar para outros múltiplos. Valores monetários são históricos da planilha; não atualizam preços do M8.";
    variants.push({
      id: variantId,
      name: `Metalplan · ${model} · Preventiva — Padrão RJ`,
      header: [
        "Metalplan",
        model,
        aliases,
        "Padrão RJ",
        "Aplicação somente por modelo",
        conditions,
        `Origem: ${filename}. Atualização da tabela de preços: ${priceDate}.`,
        footer,
      ],
      models: [model],
      rules: [],
      issues:
        family === "ROTOR"
          ? [
              "As condições de série 57... estão nas descrições dos separadores; não determinam uma faixa numérica inequívoca.",
            ]
          : [],
    });
    let rowsInSheet = 0,
      finished = false;
    for (let row = 5; row <= bounds.e.r + 1; row++) {
      const description = text(row, 0);
      if (description.startsWith("Total por revisão")) {
        finished = true;
        break;
      }
      if (!description) continue;
      if (cell(row, 1)?.f || cell(row, 3)?.f)
        throw Error(
          `Referência/quantidade calculada não prevista: ${sheet}:${row}`,
        );
      const reference = text(row, 1),
        rawQuantity = cell(row, 3)?.v;
      const quantity =
        rawQuantity == null || rawQuantity === "" ? null : Number(rawQuantity);
      if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0))
        throw Error(`Quantidade inválida: ${sheet}:${row}`);
      const hours: number[] = [];
      const marks: string[] = [];
      for (const { column, hours: columnHours, original } of columns) {
        const flag = text(row, column + 1);
        if (flag && !/^x$/i.test(flag))
          throw Error(`Marcação desconhecida: ${sheet}:${row}`);
        if (flag) {
          hours.push(...columnHours);
          marks.push(original);
        }
      }
      const exact = [...new Set(hours)].sort((a, b) => a - b);
      const interval = exact.length
        ? `Revisões previstas: ${exact.join(", ")} h`
        : "";
      const section = /^(Revisão|Serviço)/i.test(description)
        ? "Serviços"
        : "Peças e consumíveis";
      const refs = reference.includes("+")
        ? reference.split("+").map((v) => v.trim())
        : [reference];
      if (
        refs.some(
          (r) => reference.includes("+") && !validCode(normalizeCode(r)),
        )
      )
        throw Error("Conjunto de referências inválido: " + reference);
      const issueBase: string[] = [];
      if (quantity === null)
        issueBase.push("Quantidade não informada na origem.");
      if (!exact.length)
        issueBase.push(
          "Linha sem marcação de revisão; aplicação em horas não inferida.",
        );
      if (/s[eé]rie/i.test(description))
        issueBase.push(
          "Condição de série preservada literalmente; conferir antes da aplicação.",
        );
      const price = text(row, 2);
      for (const [part, ref] of refs.entries()) {
        const normalized = normalizeCode(ref),
          code = validCode(normalized) ? normalized : null;
        const issues = [
          ...issueBase,
          ...(!code
            ? [
                ref
                  ? "Referência preservada sem vínculo automático: formato com separador não reconhecido."
                  : "Sem referência de produto na origem.",
              ]
            : []),
        ];
        const observation = [
          refs.length > 1
            ? `Referências do conjunto na origem: ${reference}. Parte ${part + 1}/${refs.length}. Quantidade do conjunto: ${quantity}; quantidade individual não informada.`
            : `Quantidade na lista: ${quantity === null ? "não informada" : String(quantity).replace(".", ",")}.`,
          `Origem: ${filename}; aba ${sheet}; linha ${row}.`,
          marks.length
            ? `Colunas marcadas X: ${marks.join(" | ")}. Aplicação somente nas revisões indicadas; não inferir outros múltiplos.`
            : "Sem marcação X de revisão na origem.",
          price
            ? `Valor histórico da linha (com frete e IPI/ST): ${price}. Atualização da tabela de preços: ${priceDate}. Não é preço atual do M8.`
            : "Valor não informado na origem.",
          /Lubrificante Rotor Oil EXTRA/i.test(description) && family === "DD"
            ? "A aba Preços denomina o código 3020225 como ECOBLUE; a aba do modelo informa EXTRA. Denominações preservadas para conferência."
            : "",
          ...issueBase,
        ]
          .filter(Boolean)
          .join(" ");
        entries.push({
          id: hash(variantId + ":" + row + ":" + part),
          variant_id: variantId,
          sheet,
          row: row * 10 + part,
          section,
          description,
          code_original: ref,
          code,
          observation,
          interval_original: interval,
          interval_hours: null,
          issues,
        });
        formatted.push({
          Fabricante: "Metalplan",
          Modelo: model,
          Versão: "Preventiva — Padrão RJ",
          Grupo: section,
          "Descrição da peça/serviço": description,
          "Referência original": ref,
          "Referências do conjunto": refs.length > 1 ? reference : "",
          "Quantidade na fonte": quantity ?? "",
          "Quantidade refere-se a": refs.length > 1 ? "Conjunto" : "Linha",
          "Revisões previstas (horas)": exact.join(", "),
          "Intervalo periódico inferido": "",
          "Arquivo de origem": filename,
          "Aba de origem": sheet,
          "Linha de origem": row,
          Observações: observation,
        });
      }
      rowsInSheet++;
      sourceRows++;
    }
    const expectedRows =
      family === "DD"
        ? 11
        : sheet === "TPF_15"
          ? 9
          : sheet === "TPF_25"
            ? 10
            : family === "TPF"
              ? 11
              : 19;
    if (!finished || rowsInSheet !== expectedRows)
      throw Error(`Quantidade de linhas inesperada: ${sheet}: ${rowsInSheet}`);
  }
  warnings.push(
    "Revisões preservadas como listas exatas de horas, sem tratá-las como periodicidades. Use o intervalo textual correspondente para filtrar a matriz original.",
  );
  if (entries.some((e) => e.code_original && !e.code))
    warnings.push(
      "Referências com / preservadas sem vínculo automático; não foram alteradas para códigos semelhantes.",
    );
  if (family === "DD")
    warnings.push(
      "Óleo 3020225: ECOBLUE na aba Preços e EXTRA nas abas de modelo; conferir especificação.",
    );
  return {
    revision,
    variants,
    entries,
    formatted,
    report: {
      managed: true,
      sourceType: "rj-preventive-matrix",
      source: filename,
      sha256: digest,
      family,
      sourceRows,
      items: entries.length,
      models: variants.map((v) => ({
        model: v.models[0],
        items: entries.filter((e) => e.variant_id === v.id).length,
      })),
      withoutCode: entries.filter((e) => !e.code).length,
      priceDate,
      warnings,
    },
  };
}
