import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const input =
  process.argv[2] ||
  fileURLToPath(
    new URL("../../Evolução de Faturamento do Grupo.xls", import.meta.url),
  );
const bytes = readFileSync(input),
  book = XLSX.read(bytes);
const mapping = [
  ["1", "FATURAMENTO RJ IND. "],
  ["2", "FATURAMENTO SERRANA"],
  ["27404", "FATURAMENTO CRICIÚMA"],
  ["all", "EVOLUÇÃO DO GRUPO 2026"],
];
const monthNames = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];
const cents = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
const records = [];
for (const [scope, sheet] of mapping) {
  const rows = XLSX.utils.sheet_to_json(book.Sheets[sheet], {
    header: 1,
    defval: null,
  });
  const header = rows.findIndex((row) => row[0] === "MÊS");
  if (header < 0) throw Error("Cabeçalho ausente: " + sheet);
  for (let col = 1; col < rows[header].length; col++) {
    const year = Number(rows[header][col]);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) continue;
    const annualOnly = scope === "1" && year <= 2011;
    const months = monthNames.map((name) =>
      annualOnly ? null : cents(rows.find((row) => row[0] === name)?.[col]),
    );
    const total = cents(rows.find((row) => row[0] === "TOTAL")?.[col]);
    const average = cents(rows.find((row) => row[0] === "MÉDIA")?.[col]);
    if (
      !annualOnly &&
      total != null &&
      Math.abs(months.reduce((sum, v) => sum + (v || 0), 0) - total) > 0.03
    )
      throw Error("Total inconsistente: " + scope + "/" + year);
    records.push({ scope, year, months, total, average, annualOnly, sheet });
  }
}
// RJ Equipamentos is supplemental to the original three-company consolidated.
const equipmentInput = process.argv[3] || fileURLToPath(new URL(
  "../../Evolução de Faturamento do Grupo - 2025 (RJ EQUIPAMENTOS).xls", import.meta.url));
const equipmentBytes = readFileSync(equipmentInput);
const equipmentBook = XLSX.read(equipmentBytes);
const sheetName = equipmentBook.SheetNames.find(name => name.trim() === "FATURAMENTO RJ EQUIP. CONGELADO");
if (!sheetName) throw Error("Aba de faturamento da RJ Equipamentos ausente");
const equipmentRows = XLSX.utils.sheet_to_json(equipmentBook.Sheets[sheetName], {header:1, defval:null});
const equipmentHeader = equipmentRows.find(row => row[0] === "MÊS");
if (!equipmentHeader) throw Error("Cabeçalho da RJ Equipamentos ausente");
for (let col=1; col<equipmentHeader.length; col++) {
  const year=Number(equipmentHeader[col]);
  if (!Number.isInteger(year) || year<2000 || year>2100) continue;
  const months=monthNames.map(name => cents(equipmentRows.find(row=>row[0]===name)?.[col]));
  const total=cents(equipmentRows.find(row=>row[0]==="TOTAL")?.[col]);
  const average=cents(equipmentRows.find(row=>row[0]==="MÉDIA")?.[col]);
  if (total == null || Math.abs(months.reduce((n,v)=>n+(v??0),0)-total)>0.03)
    throw Error("Total inconsistente: RJ Equipamentos/"+year);
  records.push({scope:"rj-equipamentos",year,months,total,average,annualOnly:false,sheet:sheetName});
}
const document = {
  source: "Evolução de Faturamento do Grupo.xls; Evolução de Faturamento do Grupo - 2025 (RJ EQUIPAMENTOS).xls",
  sources: [{file:"Evolução de Faturamento do Grupo.xls",sha256:createHash("sha256").update(bytes).digest("hex")},
    {file:"Evolução de Faturamento do Grupo - 2025 (RJ EQUIPAMENTOS).xls",sha256:createHash("sha256").update(equipmentBytes).digest("hex")}],
  sha256: createHash("sha256").update(bytes).update(equipmentBytes).digest("hex"),
  records,
};
writeFileSync(
  new URL("../lib/billing-evolution/history.json", import.meta.url),
  JSON.stringify(document, null, 2) + "\n",
);
console.log(
  records.length + " resumos anuais preservados; totais mensais conferidos.",
);
