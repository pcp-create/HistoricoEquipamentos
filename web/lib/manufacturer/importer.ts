import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import {
  fold,
  modelKeys,
  normalizeCode,
  validCode,
  type Variant,
} from "./rules";
export type ManualEntry = {
  id: string;
  variant_id: string;
  sheet: string;
  row: number;
  section: string;
  description: string;
  code_original: string;
  code: string | null;
  observation: string;
  interval_original: string;
  interval_hours: number | null;
  issues: string[];
};
const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export function parseManual(bytes: Buffer, filename: string) {
  if (bytes.length > 30 * 1024 * 1024) throw new Error("Planilha excede 30 MB");
  const book = XLSX.read(bytes, {
    type: "buffer",
    cellFormula: true,
    cellNF: true,
  });
  const revision = hash(bytes),
    variants: Variant[] = [],
    entries: ManualEntry[] = [],
    warnings: string[] = [];
  const text = (sheet: XLSX.WorkSheet, address: string) => {
    const c = sheet[address];
    return c && c.t !== "e" ? String(c.w ?? c.v ?? "").trim() : "";
  };
  const names = book.SheetNames.filter(
    (n) => !["SELECAO", "PLAN1", "PLAN2"].includes(fold(n).trim()),
  );
  const byName = new Map<string, Variant>();
  for (const name of names) {
    const sheet = book.Sheets[name];
    if (!sheet["!ref"]) continue;
    const bounds = XLSX.utils.decode_range(sheet["!ref"]);
    if (bounds.e.r > 10000 || bounds.e.c > 200)
      throw new Error("Dimensões de planilha inesperadas");
    const v: Variant = {
      id: hash(revision + ":" + name),
      name,
      header: [],
      models: [],
      rules: [],
      issues: [],
    };
    let section = "",
      started = false;
    for (let r = 0; r <= bounds.e.r; r++) {
      const row = r + 1,
        description = text(sheet, "B" + row),
        code = text(sheet, "C" + row),
        obs = text(sheet, "D" + row),
        hours = text(sheet, "E" + row);
      if (
        /^(PECAS PRINCIPAIS|KITS DE SERVICO|OUTROS ITENS DIVERSOS)$/.test(
          fold(description),
        )
      ) {
        section = description;
        started = true;
        continue;
      }
      if (!started) {
        if (description) v.header.push(description);
        continue;
      }
      if (
        !section ||
        fold(code) === "CODIGO" ||
        fold(description) === "DESCRICAO" ||
        (!description && !code)
      )
        continue;
      const issues: string[] = [];
      let normalized = normalizeCode(code);
      if (!validCode(normalized)) {
        issues.push("Código ausente ou formato a conferir");
        normalized = "";
      }
      if (!description) issues.push("Descrição ausente na origem");
      if (sheet["C" + row]?.f || sheet["C" + row]?.t === "e") {
        issues.push("Código calculado ou com erro na origem");
        normalized = "";
      }
      if (sheet["C" + row]?.t === "n" && normalized.length !== 10) {
        issues.push(
          "Código numérico com comprimento não usual; conferir zeros",
        );
        normalized = "";
      }
      const hoursValue = sheet["E" + row]?.v;
      const interval =
        typeof hoursValue === "number" &&
        Number.isFinite(hoursValue) &&
        hoursValue > 0
          ? hoursValue
          : null;
      if (hours && interval === null)
        issues.push("Intervalo mantido como texto");
      entries.push({
        id: hash(v.id + ":" + row),
        variant_id: v.id,
        sheet: name,
        row,
        section,
        description: description || "Descrição não informada",
        code_original: code,
        code: normalized || null,
        observation: obs,
        interval_original: hours,
        interval_hours: interval,
        issues,
      });
    }
    if (!entries.some((e) => e.variant_id === v.id))
      throw new Error("Aba de modelo sem itens reconhecidos: " + name);
    v.models = modelKeys(v.header.join(" "));
    variants.push(v);
    byName.set(name.trim(), v);
  }
  const selection = book.Sheets["SELEÇÃO"];
  if (selection) {
    for (const [address, cell] of Object.entries(selection)) {
      if (address.startsWith("!") || !cell.l?.Target) continue;
      const target = cell.l.Target.match(/^#(?:'((?:[^']|'')+)'|([^!]+))!/);
      if (!target) continue;
      const sheetName = (target[1] || target[2]).replace(/''/g, "'").trim(),
        v = byName.get(sheetName);
      const coord = XLSX.utils.decode_cell(address),
        model = text(selection, (coord.c < 13 ? "C" : "N") + (coord.r + 1));
      if (!v) {
        warnings.push(`SELEÇÃO!${address}: destino sem catálogo de peças`);
        continue;
      }
      const serial = text(selection, address);
      if (!model || !modelKeys(model).length) {
        warnings.push(`SELEÇÃO!${address}: modelo não reconhecido`);
        continue;
      }
      v.rules.push({ model, serial, cell: address });
      v.models = [...new Set([...v.models, ...modelKeys(model)])];
    }
  }
  for (const v of variants)
    if (!v.rules.length)
      v.issues.push(
        "Sem regra vinculada na seleção; conferir cabeçalho e versão",
      );
  if (!variants.length || !entries.length)
    throw new Error("Nenhum catálogo reconhecido");
  return {
    revision,
    filename,
    variants,
    entries,
    warnings,
    report: {
      sheets: book.SheetNames.length,
      variants: variants.length,
      entries: entries.length,
      review: entries.filter((e) => e.issues.length).length,
      selection_warnings: warnings.length,
    },
  };
}
